import type { DirectoryGrant } from './resolveGrantedPath'
import { readdir, realpath, stat } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { createSensitivePathMatcher } from '../permissions/sensitivePaths'
import { resolveGrantedPath } from './resolveGrantedPath'

const IGNORED_SEARCH_DIRECTORIES = new Set(['.git', 'dist', 'node_modules', 'out', 'target'])
const MAX_SEARCHED_ENTRIES = 5_000
const MAX_SEARCH_RESULTS = 50

export interface DirectorySearchEntry {
  kind: 'directory' | 'file'
  name: string
  path: string
  relativePath: string
}

export function parseDirectorySearch(query: string, root: string): { path: string, term: string } {
  const hasPath = query.includes('/') || (sep === '\\' && query.includes('\\'))
  const trailing = query.endsWith('/') || query.endsWith(sep)
  return {
    path: hasPath ? resolve(root, trailing ? query : dirname(query)) : root,
    term: hasPath ? trailing ? '' : basename(query) : query,
  }
}

export async function searchDirectoryEntries(grant: DirectoryGrant, path: string, term: string, deepSearch: boolean): Promise<{ entries: DirectorySearchEntry[], hasMore: boolean }> {
  if (await realpath(grant.root) !== grant.canonicalRoot)
    throw new Error('Directory identity changed')
  const start = (await resolveGrantedPath([grant], path, 'existing')).canonicalPath
  const sensitive = createSensitivePathMatcher()
  if (sensitive.matches(path) || sensitive.matches(start))
    throw new Error('Directory is not available')
  const pending = [start]
  const visited = new Set<string>()
  const results: DirectorySearchEntry[] = []
  let searched = 0
  while (pending.length && searched < MAX_SEARCHED_ENTRIES) {
    const current = pending.shift()!
    if (visited.has(current))
      continue
    visited.add(current)
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    }
    catch (error) {
      if (current === start)
        throw error
      continue
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (++searched > MAX_SEARCHED_ENTRIES)
        break
      if (!entry.isFile() && !entry.isDirectory() && !entry.isSymbolicLink())
        continue
      const candidate = join(current, entry.name)
      if (sensitive.matches(candidate))
        continue
      try {
        const canonical = (await resolveGrantedPath([grant], candidate, 'existing')).canonicalPath
        if (sensitive.matches(canonical))
          continue
        const metadata = entry.isSymbolicLink() ? await stat(canonical) : entry
        if (!metadata.isFile() && !metadata.isDirectory())
          continue
        if (deepSearch && metadata.isDirectory() && !IGNORED_SEARCH_DIRECTORIES.has(entry.name))
          pending.push(canonical)
        const result: DirectorySearchEntry = { name: entry.name, path: canonical, kind: metadata.isDirectory() ? 'directory' : 'file', relativePath: relative(start, candidate) }
        if (!term || score(result, term, deepSearch) > 0)
          results.push(result)
      }
      catch {}
    }
  }
  results.sort((left, right) => score(right, term, deepSearch) - score(left, term, deepSearch)
    || left.relativePath.split(sep).length - right.relativePath.split(sep).length
    || Number(right.kind === 'directory') - Number(left.kind === 'directory')
    || left.name.localeCompare(right.name)
    || left.relativePath.localeCompare(right.relativePath))
  return { entries: results.slice(0, MAX_SEARCH_RESULTS), hasMore: searched >= MAX_SEARCHED_ENTRIES || results.length > MAX_SEARCH_RESULTS }
}

function score(entry: DirectorySearchEntry, query: string, deepSearch: boolean): number {
  if (!query)
    return 0
  const term = query.toLocaleLowerCase()
  const name = entry.name.toLocaleLowerCase()
  return name === term ? 4 : name.startsWith(term) ? 3 : name.includes(term) ? 2 : deepSearch && entry.relativePath.toLocaleLowerCase().includes(term) ? 1 : 0
}
