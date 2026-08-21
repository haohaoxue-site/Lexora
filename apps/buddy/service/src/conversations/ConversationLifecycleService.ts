import type { ConversationRepository } from '../storage/conversationRepository'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'

const sessionIdentityPattern = /^[A-Z0-9][\w-]{0,127}$/i

export interface ConversationLifecycleServiceOptions {
  agentDirectory: string
  conversations: ConversationRepository
  runner: {
    cancelAndWaitForConversation: (conversationId: string) => Promise<number>
  }
  sessions: {
    invalidateConversation: (conversationId: string) => Promise<number>
  }
}

export class ConversationLifecycleService {
  readonly #agentDirectory: string
  readonly #conversations: ConversationRepository
  readonly #deleting = new Set<string>()
  readonly #runner: ConversationLifecycleServiceOptions['runner']
  readonly #sessions: ConversationLifecycleServiceOptions['sessions']

  constructor(options: ConversationLifecycleServiceOptions) {
    this.#agentDirectory = options.agentDirectory
    this.#conversations = options.conversations
    this.#runner = options.runner
    this.#sessions = options.sessions
  }

  async delete(conversationId: string): Promise<boolean> {
    if (!this.#conversations.findById(conversationId))
      return false
    if (!sessionIdentityPattern.test(conversationId))
      throw new ConversationLifecycleError()
    if (this.#deleting.has(conversationId))
      throw new ConversationLifecycleError()
    if (this.#conversations.isDeleted(conversationId) && !this.#conversations.isDeleting(conversationId))
      return false

    this.#deleting.add(conversationId)
    try {
      if (
        !this.#conversations.isDeleting(conversationId)
        && !this.#conversations.markDeleting(conversationId, new Date().toISOString())
      ) {
        return false
      }
      await this.#runner.cancelAndWaitForConversation(conversationId)
      await this.#sessions.invalidateConversation(conversationId)
      await rm(join(this.#agentDirectory, 'sessions', conversationId), {
        force: true,
        recursive: true,
      })
      return this.#conversations.completeDeletion(conversationId, new Date().toISOString())
    }
    finally {
      this.#deleting.delete(conversationId)
    }
  }

  isDeleting(conversationId: string): boolean {
    return this.#deleting.has(conversationId) || this.#conversations.isDeleted(conversationId)
  }

  async recoverPendingDeletions(): Promise<number> {
    const conversationIds = this.#conversations.listDeleting()
    for (const conversationId of conversationIds)
      await this.delete(conversationId)
    return conversationIds.length
  }
}

export class ConversationLifecycleError extends Error {
  readonly code = 'VALIDATION_FAILED'

  constructor() {
    super('Lexora Buddy conversation identity is invalid')
    this.name = 'ConversationLifecycleError'
  }
}
