import type { ConversationRepository } from '../storage/conversationRepository'

const conversationIdentityPattern = /^[A-Z0-9][\w-]{0,127}$/i

export interface ConversationLifecycleServiceOptions {
  conversations: ConversationRepository
  runner: {
    cancelAndWaitForConversation: (conversationId: string) => Promise<number>
  }
  sessions: {
    invalidateConversation: (conversationId: string) => Promise<number>
  }
}

export class ConversationLifecycleService {
  readonly #conversations: ConversationRepository
  readonly #deleting = new Set<string>()
  readonly #runner: ConversationLifecycleServiceOptions['runner']
  readonly #sessions: ConversationLifecycleServiceOptions['sessions']

  constructor(options: ConversationLifecycleServiceOptions) {
    this.#conversations = options.conversations
    this.#runner = options.runner
    this.#sessions = options.sessions
  }

  async delete(conversationId: string): Promise<boolean> {
    if (!conversationIdentityPattern.test(conversationId))
      throw new ConversationLifecycleError()
    const conversation = this.#conversations.findById(conversationId)
    if (!conversation || conversation.deletedAt !== null)
      return false
    if (this.#deleting.has(conversationId))
      throw new ConversationLifecycleError()

    this.#deleting.add(conversationId)
    try {
      const deletedAt = new Date().toISOString()
      if (!this.#conversations.markDeleted(conversationId, deletedAt))
        return false
      await this.#runner.cancelAndWaitForConversation(conversationId)
      await this.#sessions.invalidateConversation(conversationId)
      return true
    }
    finally {
      this.#deleting.delete(conversationId)
    }
  }

  isDeleting(conversationId: string): boolean {
    return this.#deleting.has(conversationId) || this.#conversations.isDeleted(conversationId)
  }

  recoverPendingDeletions(): Promise<number> {
    return Promise.resolve(0)
  }
}

export class ConversationLifecycleError extends Error {
  readonly code = 'VALIDATION_FAILED'

  constructor() {
    super('Lexora Buddy conversation identity is invalid')
    this.name = 'ConversationLifecycleError'
  }
}
