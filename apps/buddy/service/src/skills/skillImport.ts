import type { SkillOrigin } from '../../../shared/skills/skillApi'
import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { unzipSync } from 'fflate'
import { MAX_SKILL_FILES, MAX_SKILL_PACKAGE_BYTES, requireSkillPath, SkillError } from './skillFiles'

const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024

export function validateArchivePath(path: string): string {
  const parts = path.replace(/\/$/, '').split('/')
  if (!parts.length || parts.some(part => !part || part === '.' || part === '..'
    || /[\\<>:"|?*]/.test(part) || [...part].some(character => character.charCodeAt(0) < 32) || /[. ]$/.test(part)
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new SkillError('SKILL_INVALID')
  }
  return parts.join('/')
}

export async function writeSkillFiles(root: string, files: ReadonlyMap<string, Uint8Array>, modes?: ReadonlyMap<string, number>) {
  await mkdir(root, { recursive: true, mode: 0o700 })
  for (const [name, content] of files) {
    const path = join(root, validateArchivePath(name))
    await mkdir(dirname(path), { recursive: true, mode: 0o700 })
    await writeFile(path, content, { flag: 'wx', mode: modes?.get(name) ?? (content[0] === 35 && content[1] === 33 ? 0o700 : 0o600) })
  }
}

export async function extractSkillArchive(data: Uint8Array, root: string) {
  if (data.length > MAX_ARCHIVE_BYTES)
    throw new SkillError('SKILL_TOO_LARGE')
  let bytes = 0
  let count = 0
  const names = new Set<string>()
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(data, {
      filter(file) {
        const name = validateArchivePath(file.name).toLowerCase()
        if (names.has(name))
          throw new SkillError('SKILL_INVALID')
        names.add(name)
        bytes += file.originalSize
        if (++count > MAX_SKILL_FILES || bytes > MAX_SKILL_PACKAGE_BYTES)
          throw new SkillError('SKILL_TOO_LARGE')
        return !file.name.endsWith('/')
      },
    })
  }
  catch (error) {
    if (error instanceof SkillError)
      throw error
    throw new SkillError('SKILL_INVALID', { cause: error })
  }
  if (Object.values(entries).reduce((total, value) => total + value.length, 0) > MAX_SKILL_PACKAGE_BYTES)
    throw new SkillError('SKILL_TOO_LARGE')
  await writeSkillFiles(root, new Map(Object.entries(entries)))
}

async function download(url: string, limit: number): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Lexora-Buddy', 'Accept': 'application/vnd.github+json' },
    signal: AbortSignal.timeout(60_000),
    redirect: 'error',
  })
  if (!response.ok || !response.body)
    throw new SkillError('SKILL_SOURCE_UNAVAILABLE')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      bytes += value.length
      if (bytes > limit)
        throw new SkillError('SKILL_TOO_LARGE')
      chunks.push(value)
    }
    return Buffer.concat(chunks)
  }
  finally { await reader.cancel() }
}

export async function prepareSkillSource(source: SkillOrigin, temporaryRoot: string): Promise<{ root: string, source: SkillOrigin }> {
  if (source.kind === 'directory')
    return { root: await requireSkillPath(source.location, source.location), source }
  const archiveRoot = join(temporaryRoot, 'archive')
  if (source.kind !== 'github')
    throw new SkillError('SKILL_READ_ONLY')
  const match = /^(?:https:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(source.location.trim())
  if (!match)
    throw new SkillError('SKILL_INVALID')
  const repository = `${match[1]}/${match[2]}`
  const ref = source.ref?.trim() || 'HEAD'
  const result: unknown = JSON.parse((await download(`https://api.github.com/repos/${repository}/commits/${encodeURIComponent(ref)}`, 4 * 1024 * 1024)).toString('utf8'))
  const commit = result && typeof result === 'object' && 'sha' in result ? result.sha : null
  if (typeof commit !== 'string' || !/^[a-f0-9]{40,64}$/i.test(commit))
    throw new SkillError('SKILL_SOURCE_UNAVAILABLE')
  await extractSkillArchive(await download(`https://codeload.github.com/${repository}/zip/${commit}`, MAX_ARCHIVE_BYTES), archiveRoot)
  const repoRoot = join(archiveRoot, `${match[2]}-${commit}`)
  const subdirectory = source.subdirectory?.trim() || ''
  const root = subdirectory ? await requireSkillPath(repoRoot, join(repoRoot, validateArchivePath(subdirectory))) : repoRoot
  return { root, source: { kind: 'github', location: `https://github.com/${repository}`, ref, commit, ...(subdirectory ? { subdirectory } : {}) } }
}
