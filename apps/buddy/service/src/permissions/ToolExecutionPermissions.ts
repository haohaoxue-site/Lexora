import type { BuddyExtensionRunContext } from '../agent/extensions/BuddyExtensionRunContext'
import type { DirectoryGrant } from '../directories/resolveGrantedPath'
import type { PermissionPath } from './permissionContract'
import { dirname } from 'node:path'
import { classifyPath, PathClassificationError } from './classifyPath'
import { createSensitivePathMatcher } from './sensitivePaths'

export class ToolExecutionPermissions {
  readonly #runs = new WeakMap<BuddyExtensionRunContext, Map<string, DirectoryGrant[]>>()
  readonly #sensitive = createSensitivePathMatcher()

  async authorize(run: BuddyExtensionRunContext, toolCallId: string, input: {
    cwd: string
    grants: readonly DirectoryGrant[]
    paths: readonly PermissionPath[]
    reviewedPaths?: readonly { path: string }[]
  }): Promise<void> {
    const grants: DirectoryGrant[] = []
    for (const [index, path] of input.paths.entries()) {
      run.signal.throwIfAborted()
      const target = await classifyPath({ ...input, ...path, sensitive: this.#sensitive })
      if (input.reviewedPaths && target.canonicalPath !== input.reviewedPaths[index]?.path)
        throw new PathClassificationError('INVALID_PATH')
      if (target.zone !== 'outside')
        continue
      const root = target.isDirectory ? target.canonicalPath : dirname(target.canonicalPath)
      grants.push({ canonicalRoot: root, root, kind: 'granted', grantId: `run:${run.runId}:${toolCallId}:${grants.length}` })
    }
    run.signal.throwIfAborted()
    let calls = this.#runs.get(run)
    if (!calls) {
      calls = new Map()
      this.#runs.set(run, calls)
      run.signal.addEventListener('abort', () => this.#runs.delete(run), { once: true })
    }
    calls.set(toolCallId, grants)
  }

  get(run: BuddyExtensionRunContext | null, toolCallId: string): readonly DirectoryGrant[] {
    return run && !run.signal.aborted ? this.#runs.get(run)?.get(toolCallId) ?? [] : []
  }
}
