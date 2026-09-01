import { resolve } from 'node:path'

const identityPattern = /^[A-Z0-9][\w-]{0,127}$/i

export class BuddyDataPaths {
  readonly root: string

  constructor(root: string) {
    this.root = resolve(root)
  }

  get conversationsDirectory(): string {
    return resolve(this.root, 'conversations')
  }

  get draftsDirectory(): string {
    return resolve(this.root, 'drafts')
  }

  get spacesDirectory(): string {
    return resolve(this.root, 'spaces')
  }

  conversationDirectory(conversationId: string): string {
    return resolve(this.conversationsDirectory, requireIdentity(conversationId))
  }

  conversationWorkspace(conversationId: string): string {
    return resolve(this.conversationDirectory(conversationId), 'workspace')
  }

  spaceDirectory(spaceId: string): string {
    return resolve(this.spacesDirectory, requireIdentity(spaceId))
  }

  spaceWorkspace(spaceId: string): string {
    return resolve(this.spaceDirectory(spaceId), 'workspace')
  }

  messageInputs(conversationId: string, messageId: string): string {
    return resolve(
      this.conversationDirectory(conversationId),
      'inputs',
      requireIdentity(messageId),
    )
  }

  conversationArtifactsDirectory(conversationId: string): string {
    return resolve(
      this.conversationDirectory(conversationId),
      'artifacts',
    )
  }

  conversationChangesDirectory(conversationId: string, runId: string): string {
    return resolve(
      this.conversationDirectory(conversationId),
      'changes',
      requireIdentity(runId),
    )
  }

  changeSnapshot(
    conversationId: string,
    runId: string,
    captureId: string,
    side: 'after' | 'before',
  ): string {
    return resolve(
      this.conversationChangesDirectory(conversationId, runId),
      `${requireIdentity(captureId)}-${side}.txt`,
    )
  }

  conversationEvents(conversationId: string): string {
    return resolve(this.conversationDirectory(conversationId), 'events')
  }

  runEventFile(conversationId: string, runId: string): string {
    return resolve(this.conversationEvents(conversationId), `${requireIdentity(runId)}.jsonl`)
  }

  sessionDirectory(conversationId: string, branchId: string): string {
    return resolve(
      this.conversationDirectory(conversationId),
      'session',
      requireIdentity(branchId),
    )
  }

  draftAttachments(draftId: string): string {
    return resolve(this.draftsDirectory, requireIdentity(draftId), 'attachments')
  }
}

function requireIdentity(value: string): string {
  if (!identityPattern.test(value))
    throw new BuddyDataPathError(value)
  return value
}

export class BuddyDataPathError extends Error {
  constructor(identity: string) {
    super(`Invalid Lexora Buddy data identity: ${identity}`)
    this.name = 'BuddyDataPathError'
  }
}
