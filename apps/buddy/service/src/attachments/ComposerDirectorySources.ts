import type { BuddyComposerSource, BuddyComposerSourceListResponse, BuddyComposerSourceOption } from '../../../shared/conversation/composerResource'
import type { DirectoryGrant } from '../directories/resolveGrantedPath'
import type { ComposerResourceServiceOptions, ComposerSourceScope } from './ComposerResourceService'
import { realpath } from 'node:fs/promises'
import { basename, isAbsolute, relative } from 'node:path'
import { containsCanonicalPath } from '../../../platform/filesystem/filePaths'
import { parseDirectorySearch, searchDirectoryEntries } from '../directories/searchDirectoryEntries'
import { requireActiveSpace } from '../spaces/requireActiveSpace'
import { inspectLocalResource } from './localResource'

interface SourceRoot extends DirectoryGrant {
  owned: boolean
  source: (path: string) => BuddyComposerSource
}

export class ComposerDirectorySources {
  private readonly options: Pick<ComposerResourceServiceOptions, 'spaces' | 'paths' | 'conversationGrants'>

  constructor(options: Pick<ComposerResourceServiceOptions, 'spaces' | 'paths' | 'conversationGrants'>) {
    this.options = options
  }

  async list(scope: ComposerSourceScope, draftId: string, query: string, deepSearch: boolean): Promise<BuddyComposerSourceListResponse> {
    const space = scope.spaceId ? requireActiveSpace(this.options.spaces?.findById(scope.spaceId) ?? null) : null
    const ownedPath = space
      ? this.options.paths.spaceWorkspace(space.id)
      : scope.conversationId
        ? this.options.paths.conversationWorkspace(scope.conversationId)
        : this.options.paths.draftAttachments(draftId)
    const owned: SourceRoot = { root: ownedPath, canonicalRoot: ownedPath, grantId: space?.id ?? scope.conversationId ?? draftId, kind: 'workspace', owned: true, source: localPath => ({ localPath }) }
    const roots: SourceRoot[] = space
      ? [space.primaryDirectory, ...space.additionalDirectories].filter(directory => directory && !directory.revokedAt).map((directory) => {
          const binding = directory!
          return { root: binding.root, canonicalRoot: binding.canonicalRoot, grantId: binding.id, kind: binding.id === space.primaryDirectory?.id ? 'workspace' : 'granted', owned: false, source: path => ({ bindingId: binding.id, relativePath: relative(binding.canonicalRoot, path) || '.', spaceId: space.id }) }
        })
      : (scope.conversationId ? this.options.conversationGrants?.listActive(scope.conversationId) ?? [] : []).map(directory => ({ root: directory.root, canonicalRoot: directory.canonicalRoot, grantId: directory.id, kind: 'granted', owned: false, source: localPath => ({ localPath }) }))
    const boundDirectory = roots.find(root => root.kind === 'workspace')
    const primary = boundDirectory ?? owned
    if (!roots.includes(primary))
      roots.unshift(primary)
    if (primary !== owned)
      roots.push(owned)
    const parsed = parseDirectorySearch(query, primary.canonicalRoot)
    const directoryRequested = Boolean(boundDirectory) || query !== parsed.term
    const selected = [...roots].sort((left, right) => right.canonicalRoot.length - left.canonicalRoot.length).find(root => containsCanonicalPath(root.canonicalRoot, parsed.path))
    const directory = { workingDirectory: boundDirectory?.canonicalRoot, path: parsed.path, query: parsed.term, status: 'ready' as 'ready' | 'missing' | 'unavailable', hasMore: false }
    const files: BuddyComposerSourceOption[] = []
    if (directoryRequested) {
      try {
        if (!selected)
          throw new Error('Directory is not authorized')
        if (selected.owned) {
          const canonicalRoot = await realpath(selected.root)
          selected.canonicalRoot = canonicalRoot
        }
        const result = await searchDirectoryEntries(selected, parsed.path, parsed.term, deepSearch)
        directory.path = await realpath(parsed.path)
        directory.hasMore = result.hasMore
        const candidates = await Promise.all(result.entries.map(async (entry): Promise<BuddyComposerSourceOption | null> => {
          try {
            const metadata = await inspectLocalResource(entry.path)
            return { ...metadata, label: metadata.name, description: null, category: directory.workingDirectory && containsCanonicalPath(directory.workingDirectory, metadata.path) ? 'space' : 'external', source: selected.source(metadata.path) }
          }
          catch { return null }
        }))
        files.push(...candidates.filter((entry): entry is BuddyComposerSourceOption => entry !== null))
      }
      catch (error) {
        directory.status = selected?.owned && parsed.path === selected.root && error instanceof Error && 'code' in error && error.code === 'ENOENT' ? 'missing' : 'unavailable'
      }
    }
    if (!isAbsolute(query) && parsed.path === primary.canonicalRoot) {
      const others = await Promise.all(roots.filter(root => root !== primary && !root.owned).map(async (root): Promise<BuddyComposerSourceOption | null> => {
        try {
          if (await realpath(root.root) !== root.canonicalRoot || (query && !basename(root.root).toLocaleLowerCase().includes(query.toLocaleLowerCase())))
            return null
          const metadata = await inspectLocalResource(root.canonicalRoot)
          return metadata.kind === 'directory' ? { ...metadata, label: metadata.name, description: null, category: 'external', source: root.source(metadata.path) } : null
        }
        catch { return null }
      }))
      files.push(...others.filter((entry): entry is BuddyComposerSourceOption => entry !== null))
    }
    return { directory: directoryRequested ? directory : undefined, files }
  }
}
