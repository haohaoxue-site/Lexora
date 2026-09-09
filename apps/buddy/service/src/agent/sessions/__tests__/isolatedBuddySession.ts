import type { CreateBuddySessionOptions } from '../createBuddySession'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { SessionManager } from '@earendil-works/pi-coding-agent'
import { createBuddyContextSnapshot, createBuddySession } from '../createBuddySession'

type IsolatedSessionOptions = Omit<CreateBuddySessionOptions, 'sessionManager'> & {
  sessionManager?: SessionManager
  piSessionFile?: string
}

export async function createIsolatedBuddySession(options: IsolatedSessionOptions) {
  const directory = join(options.conversationsDirectory, options.conversationId, 'session', options.branchId)
  await mkdir(directory, { recursive: true })
  const sessionManager = options.sessionManager ?? (options.piSessionFile
    ? SessionManager.open(options.piSessionFile, directory, options.cwd)
    : SessionManager.create(options.cwd, directory))
  return createBuddySession({ ...options, sessionManager })
}

export function createIsolatedBuddyContextSnapshot(options: IsolatedSessionOptions) {
  const sessionManager = options.sessionManager ?? (options.piSessionFile
    ? SessionManager.open(options.piSessionFile, undefined, options.cwd)
    : SessionManager.inMemory(options.cwd))
  return createBuddyContextSnapshot({ ...options, sessionManager })
}
