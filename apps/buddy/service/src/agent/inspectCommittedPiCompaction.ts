import type { Usage } from '@earendil-works/pi-ai'
import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import {
  estimateTokens,
  getLatestCompactionEntry,
  SessionManager,
} from '@earendil-works/pi-coding-agent'

import {
  BuddySessionCreationError,
  isMissingBuddySessionFile,
  toBuddySessionStorageError,
} from './BuddySessionErrors'

const sessionIdentityPattern = /^[A-Z0-9][\w-]{0,127}$/i

export interface InspectCommittedPiCompactionOptions {
  agentDirectory: string
  branchId: string
  conversationId: string
  piSessionFile: string
  startedAt: string
}

export interface CommittedPiCompactionEvidence {
  compactionEntryId: string
  estimatedTokensAfter: number
  firstKeptEntryId: string
  tokensBefore: number
  usage?: Usage
}

export async function inspectCommittedPiCompaction(
  options: InspectCommittedPiCompactionOptions,
): Promise<CommittedPiCompactionEvidence | null> {
  validateIdentity(options.conversationId)
  validateIdentity(options.branchId)
  const sessionDirectory = resolve(
    options.agentDirectory,
    'sessions',
    options.conversationId,
    options.branchId,
  )
  if (
    !isAbsolute(options.piSessionFile)
    || !options.piSessionFile.endsWith('.jsonl')
    || !containsPath(sessionDirectory, resolve(options.piSessionFile))
  ) {
    throw new BuddySessionCreationError()
  }

  try {
    const [canonicalSessionDirectory, canonicalSessionFile] = await Promise.all([
      realpath(sessionDirectory),
      realpath(options.piSessionFile),
    ])
    if (!containsPath(canonicalSessionDirectory, canonicalSessionFile))
      throw new BuddySessionCreationError()
    const manager = SessionManager.open(canonicalSessionFile, canonicalSessionDirectory)
    const compaction = getLatestCompactionEntry(manager.getBranch())
    const startedAt = Date.parse(options.startedAt)
    const committedAt = compaction ? Date.parse(compaction.timestamp) : Number.NaN
    if (!compaction || !Number.isFinite(startedAt) || committedAt < startedAt)
      return null
    const estimatedTokensAfter = manager.buildSessionContext().messages.reduce(
      (total, message) => total + estimateTokens(message),
      0,
    )
    return {
      compactionEntryId: compaction.id,
      estimatedTokensAfter,
      firstKeptEntryId: compaction.firstKeptEntryId,
      tokensBefore: compaction.tokensBefore,
      ...(compaction.usage ? { usage: compaction.usage } : {}),
    }
  }
  catch (error) {
    if (error instanceof BuddySessionCreationError)
      throw error
    if (isMissingBuddySessionFile(error))
      return null
    const storageError = toBuddySessionStorageError(error)
    if (storageError)
      throw storageError
    return null
  }
}

function validateIdentity(value: string): void {
  if (!sessionIdentityPattern.test(value))
    throw new BuddySessionCreationError()
}

function containsPath(root: string, path: string): boolean {
  const child = relative(root, path)
  return child === '' || (child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child))
}
