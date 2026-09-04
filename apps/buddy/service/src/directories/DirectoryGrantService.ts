import type { GrantOwner } from '../permissions/permissionContract'
import type {
  ConversationDirectoryGrantMutation,
  ConversationDirectoryGrantRepository,
} from '../storage/conversationDirectoryGrantRepository'
import type { ConversationRepository } from '../storage/conversationRepository'
import { randomUUID } from 'node:crypto'
import { mkdir, realpath, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

export interface DirectoryGrantMutation {
  changed: boolean
  coveredGrantIds: readonly string[]
  grant: {
    canonicalRoot: string
    id: string
    root: string
  }
}

export interface DirectoryGrantServiceOptions {
  conversationGrants: ConversationDirectoryGrantRepository
  conversations: Pick<ConversationRepository, 'findById'>
  spaces: {
    grantAdditionalDirectory: (input: {
      root: string
      spaceId: string
    }) => Promise<DirectoryGrantMutation>
  }
}

export class DirectoryGrantService {
  readonly #conversationGrants: ConversationDirectoryGrantRepository
  readonly #conversations: DirectoryGrantServiceOptions['conversations']
  readonly #spaces: DirectoryGrantServiceOptions['spaces']

  constructor(options: DirectoryGrantServiceOptions) {
    this.#conversationGrants = options.conversationGrants
    this.#conversations = options.conversations
    this.#spaces = options.spaces
  }

  async grant(input: { owner: GrantOwner, root: string }): Promise<DirectoryGrantMutation> {
    if (input.owner.kind === 'space') {
      return this.#spaces.grantAdditionalDirectory({
        root: input.root,
        spaceId: input.owner.id,
      })
    }

    const conversation = this.#conversations.findById(input.owner.id)
    if (!conversation || conversation.deletedAt !== null || conversation.spaceId !== null)
      throw new DirectoryGrantError('DIRECTORY_GRANT_OWNER_INVALID')
    const root = await resolveDirectory(input.root)
    const result = this.#conversationGrants.grant({
      canonicalRoot: root,
      conversationId: conversation.id,
      createdAt: new Date().toISOString(),
      id: randomUUID(),
      root,
    })
    return toMutation(result)
  }
}

async function resolveDirectory(root: string): Promise<string> {
  try {
    const requestedRoot = resolve(root)
    await mkdir(requestedRoot, { recursive: true })
    const canonicalRoot = await realpath(requestedRoot)
    if (canonicalRoot !== requestedRoot)
      throw new Error('Directory identity changed')
    if (!(await stat(canonicalRoot)).isDirectory())
      throw new Error('Not a directory')
    return canonicalRoot
  }
  catch {
    throw new DirectoryGrantError('DIRECTORY_GRANT_INVALID')
  }
}

function toMutation(result: ConversationDirectoryGrantMutation): DirectoryGrantMutation {
  return {
    changed: result.changed,
    coveredGrantIds: result.coveredGrantIds,
    grant: {
      canonicalRoot: result.grant.canonicalRoot,
      id: result.grant.id,
      root: result.grant.root,
    },
  }
}

export class DirectoryGrantError extends Error {
  readonly code: 'DIRECTORY_GRANT_INVALID' | 'DIRECTORY_GRANT_OWNER_INVALID'

  constructor(code: DirectoryGrantError['code']) {
    super('Lexora Buddy cannot grant the requested directory')
    this.name = 'DirectoryGrantError'
    this.code = code
  }
}
