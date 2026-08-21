import type {
  AuthEvent,
  AuthInteraction,
  AuthPrompt,
} from '@earendil-works/pi-ai'
import type { ProviderAuthChallenge } from './providerSchemas'

import { randomUUID } from 'node:crypto'
import {

  providerAuthChallengeSchema,
} from './providerSchemas'

export interface AuthInteractionServiceOptions {
  notify: (method: string, params: unknown) => void
  openExternal?: (url: string) => Promise<void>
}

export interface LoginInteractionHandle {
  interaction: AuthInteraction
  loginId: string
}

interface LoginSession {
  challenges: Set<string>
  controller: AbortController
  providerId: string
}

interface PendingPrompt {
  loginId: string
  prompt: AuthPrompt
  reject: (error: Error) => void
  resolve: (value: string) => void
}

export class AuthInteractionService {
  readonly #notify: AuthInteractionServiceOptions['notify']
  readonly #openExternal?: AuthInteractionServiceOptions['openExternal']
  readonly #sessions = new Map<string, LoginSession>()
  readonly #challengeSessions = new Map<string, string>()
  readonly #pendingPrompts = new Map<string, PendingPrompt>()

  constructor(options: AuthInteractionServiceOptions) {
    this.#notify = options.notify
    this.#openExternal = options.openExternal
  }

  beginLogin(providerId: string): LoginInteractionHandle {
    const loginId = randomUUID()
    const session: LoginSession = {
      challenges: new Set(),
      controller: new AbortController(),
      providerId,
    }
    this.#sessions.set(loginId, session)
    return {
      loginId,
      interaction: {
        signal: session.controller.signal,
        notify: event => this.#handleEvent(loginId, event),
        prompt: prompt => this.#handlePrompt(loginId, prompt),
      },
    }
  }

  completeLogin(loginId: string): void {
    const session = this.#sessions.get(loginId)
    if (!session)
      return
    this.#sessions.delete(loginId)
    for (const challengeId of session.challenges) {
      this.#challengeSessions.delete(challengeId)
      const pending = this.#pendingPrompts.get(challengeId)
      if (pending) {
        pending.reject(new ProviderLoginCancelledError())
        this.#pendingPrompts.delete(challengeId)
      }
    }
  }

  respondToPrompt(challengeId: string, value: string): void {
    const pending = this.#pendingPrompts.get(challengeId)
    if (!pending)
      throw new UnknownAuthChallengeError()
    if (pending.prompt.type === 'select' && !pending.prompt.options.some(option => option.id === value))
      throw new InvalidAuthChallengeResponseError()

    this.#pendingPrompts.delete(challengeId)
    this.#removeChallenge(challengeId, pending.loginId)
    pending.resolve(value)
  }

  cancelLogin(challengeId: string): void {
    const loginId = this.#challengeSessions.get(challengeId)
    const session = loginId ? this.#sessions.get(loginId) : undefined
    if (!loginId || !session)
      throw new UnknownAuthChallengeError()
    session.controller.abort(new ProviderLoginCancelledError())
    this.completeLogin(loginId)
  }

  #handlePrompt(loginId: string, prompt: AuthPrompt): Promise<string> {
    const session = this.#requireSession(loginId)
    const challengeId = this.#registerChallenge(loginId, session)
    const challenge = providerAuthChallengeSchema.parse({
      challengeId,
      providerId: session.providerId,
      type: prompt.type,
      message: prompt.message,
      ...('placeholder' in prompt ? { placeholder: prompt.placeholder } : {}),
      ...(prompt.type === 'select' ? { options: prompt.options } : {}),
    })
    const response = new Promise<string>((resolve, reject) => {
      this.#pendingPrompts.set(challengeId, { loginId, prompt, reject, resolve })
      const abort = () => {
        if (!this.#pendingPrompts.delete(challengeId))
          return
        this.#removeChallenge(challengeId, loginId)
        reject(new ProviderLoginCancelledError())
      }
      session.controller.signal.addEventListener('abort', abort, { once: true })
      prompt.signal?.addEventListener('abort', abort, { once: true })
    })
    this.#emitChallenge(challenge)
    return response
  }

  #handleEvent(loginId: string, event: AuthEvent): void {
    const session = this.#requireSession(loginId)
    const challengeId = this.#registerChallenge(loginId, session)
    const challenge = toChallenge(challengeId, session.providerId, event)
    this.#emitChallenge(challenge)
    const externalUrl = event.type === 'auth_url'
      ? event.url
      : event.type === 'device_code'
        ? event.verificationUri
        : null
    if (externalUrl && this.#openExternal)
      void this.#openExternal(externalUrl).catch(() => {})
  }

  #emitChallenge(challenge: ProviderAuthChallenge): void {
    this.#notify('providers.authChallenge', challenge)
  }

  #registerChallenge(loginId: string, session: LoginSession): string {
    const challengeId = randomUUID()
    session.challenges.add(challengeId)
    this.#challengeSessions.set(challengeId, loginId)
    return challengeId
  }

  #removeChallenge(challengeId: string, loginId: string): void {
    this.#challengeSessions.delete(challengeId)
    this.#sessions.get(loginId)?.challenges.delete(challengeId)
  }

  #requireSession(loginId: string): LoginSession {
    const session = this.#sessions.get(loginId)
    if (!session)
      throw new ProviderLoginCancelledError()
    return session
  }
}

export class ProviderLoginCancelledError extends Error {
  readonly code = 'PROVIDER_LOGIN_CANCELLED'

  constructor() {
    super('Lexora Buddy provider login was cancelled')
    this.name = 'ProviderLoginCancelledError'
  }
}

export class UnknownAuthChallengeError extends Error {
  readonly code = 'AUTH_CHALLENGE_NOT_FOUND'

  constructor() {
    super('Lexora Buddy provider authentication challenge was not found')
    this.name = 'UnknownAuthChallengeError'
  }
}

export class InvalidAuthChallengeResponseError extends Error {
  readonly code = 'VALIDATION_FAILED'

  constructor() {
    super('Lexora Buddy provider authentication response is invalid')
    this.name = 'InvalidAuthChallengeResponseError'
  }
}

function toChallenge(
  challengeId: string,
  providerId: string,
  event: AuthEvent,
): ProviderAuthChallenge {
  switch (event.type) {
    case 'auth_url':
      return providerAuthChallengeSchema.parse({
        challengeId,
        providerId,
        type: event.type,
        url: event.url,
        instructions: event.instructions,
      })
    case 'device_code':
      return providerAuthChallengeSchema.parse({
        challengeId,
        providerId,
        type: event.type,
        userCode: event.userCode,
        verificationUri: event.verificationUri,
        intervalSeconds: event.intervalSeconds,
        expiresInSeconds: event.expiresInSeconds,
      })
    case 'info':
      return providerAuthChallengeSchema.parse({
        challengeId,
        providerId,
        type: event.type,
        message: event.message,
        links: event.links,
      })
    case 'progress':
      return providerAuthChallengeSchema.parse({
        challengeId,
        providerId,
        type: event.type,
        message: event.message,
      })
  }
}
