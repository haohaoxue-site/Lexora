import type { Skill } from '@earendil-works/pi-coding-agent'
import type { Buffer } from 'node:buffer'
import type { RuntimeRequestHandler } from '../../../shared/runtimeRpcPeer'
import type { ProjectRepository } from '../storage/projectRepository'
import { createHash } from 'node:crypto'
import { mkdir, realpath } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { loadSkillsFromDir, stripFrontmatter } from '@earendil-works/pi-coding-agent'
import { GrantedPathError, resolveGrantedPath } from '../projects/resolveGrantedPath'
import { readBoundedFile } from '../resources/BoundedFileReader'

const MAX_MATERIALIZED_SKILL_BYTES = 256 * 1024

export type BuddySkillSource = 'builtin' | 'directory' | 'global' | 'project'

export interface BuddySkillCatalogEntry {
  description: string
  enabled: boolean
  name: string
  source: BuddySkillSource
}

export interface BuddySkillDiagnostic {
  code: 'SKILL_INVALID' | 'SKILL_NAME_COLLISION' | 'SKILL_PATH_OUTSIDE_SOURCE' | 'SKILL_SOURCE_UNREADABLE'
  message: string
}

export interface BuddySkillResolution {
  diagnostics: BuddySkillDiagnostic[]
  paths: string[]
  revision: string
  skills: BuddySkillCatalogEntry[]
}

export interface BuddyMaterializedSkill {
  baseDirectory: string
  body: string
  filePath: string
  name: string
}

export function formatBuddySkillPrompt(skill: BuddyMaterializedSkill): string {
  return [
    `<skill name="${escapeXmlAttribute(skill.name)}" location="${escapeXmlAttribute(skill.filePath)}">`,
    `References are relative to ${skill.baseDirectory}.`,
    '',
    skill.body,
    '</skill>',
  ].join('\n')
}

export interface SkillServiceOptions {
  agentDirectory: string
  builtinSkillsDirectory: string
  projects: ProjectRepository
}

interface SkillSourceDirectory {
  directory: string
  source: BuddySkillSource
}

interface LoadedBuddySkill {
  catalog: BuddySkillCatalogEntry
  contentHash: string
  path: string
  readRoot: string
}

interface LoadedBuddySkillResolution {
  diagnostics: BuddySkillDiagnostic[]
  skills: LoadedBuddySkill[]
}

export class SkillService {
  readonly #agentDirectory: string
  readonly #builtinSkillsDirectory: string
  readonly #projects: ProjectRepository

  constructor(options: SkillServiceOptions) {
    this.#agentDirectory = options.agentDirectory
    this.#builtinSkillsDirectory = options.builtinSkillsDirectory
    this.#projects = options.projects
  }

  async load(): Promise<BuddySkillResolution> {
    return this.#loadResolved(undefined)
  }

  async loadForProject(projectId: string | null): Promise<BuddySkillResolution> {
    return this.#loadResolved(projectId)
  }

  async materializeForProject(
    projectId: string | null,
    names: readonly string[],
  ): Promise<BuddyMaterializedSkill[]> {
    if (names.length === 0)
      return []
    const resolution = await this.#loadSelected(projectId)
    const byName = new Map(resolution.skills.map(skill => [skill.catalog.name, skill]))
    const selected: BuddyMaterializedSkill[] = []
    for (const name of new Set(names)) {
      const skill = byName.get(name)
      if (!skill)
        throw new BuddySkillSelectionError('SKILL_NOT_FOUND')
      let content: Buffer
      try {
        content = await readBoundedFile(skill.readRoot, skill.path)
      }
      catch (error) {
        throw new BuddySkillSelectionError('SKILL_UNREADABLE', { cause: error })
      }
      if (content.byteLength > MAX_MATERIALIZED_SKILL_BYTES)
        throw new BuddySkillSelectionError('SKILL_TOO_LARGE')
      selected.push({
        baseDirectory: dirname(skill.path),
        body: stripFrontmatter(content.toString('utf8')).trim(),
        filePath: skill.path,
        name,
      })
    }
    return selected
  }

  async #loadResolved(projectId: string | null | undefined): Promise<BuddySkillResolution> {
    const resolution = await this.#loadSelected(projectId)
    return {
      diagnostics: resolution.diagnostics,
      paths: resolution.skills.map(skill => skill.path),
      revision: createSkillRevision(resolution.skills),
      skills: resolution.skills.map(skill => skill.catalog),
    }
  }

  async #loadSelected(projectId: string | null | undefined): Promise<LoadedBuddySkillResolution> {
    const diagnostics: BuddySkillDiagnostic[] = []
    const sources = await this.#resolveSources(diagnostics, projectId)
    const loaded: LoadedBuddySkill[] = []
    for (const source of sources)
      loaded.push(...await loadSource(source, diagnostics))

    const selected = new Map<string, LoadedBuddySkill>()
    for (const skill of loaded) {
      if (selected.has(skill.catalog.name)) {
        diagnostics.push({
          code: 'SKILL_NAME_COLLISION',
          message: 'A lower-priority Lexora Buddy skill was ignored because its name is already in use',
        })
        continue
      }
      selected.set(skill.catalog.name, skill)
    }
    const skills = [...selected.values()].sort((left, right) => (
      left.catalog.name.localeCompare(right.catalog.name)
    ))
    return {
      diagnostics,
      skills,
    }
  }

  async #resolveSources(
    diagnostics: BuddySkillDiagnostic[],
    projectId: string | null | undefined,
  ): Promise<SkillSourceDirectory[]> {
    await mkdir(this.#agentDirectory, { mode: 0o700, recursive: true })
    const globalSkillsDirectory = join(this.#agentDirectory, 'skills')
    await mkdir(globalSkillsDirectory, { mode: 0o700, recursive: true })
    const sources: SkillSourceDirectory[] = []
    const builtin = await resolveSourceDirectory(
      this.#builtinSkillsDirectory,
      this.#builtinSkillsDirectory,
      'builtin',
      diagnostics,
    )
    if (builtin)
      sources.push(builtin)
    const projects = this.#projects.list()
      .filter(project => project.revokedAt === null)
      .filter(project => projectId === undefined || project.id === projectId)
      .sort((left, right) => left.canonicalRoot.localeCompare(right.canonicalRoot))
    for (const project of projects) {
      if (!project.managedRoot)
        continue
      const projectDirectory = dirname(project.managedRoot)
      const source = await resolveSourceDirectory(
        projectDirectory,
        join(projectDirectory, 'skills'),
        'project',
        diagnostics,
        true,
      )
      if (source)
        sources.push(source)
    }
    for (const project of projects) {
      for (const relativePath of [['.agents', 'skills'], ['.pi', 'skills']] as const) {
        const source = await resolveSourceDirectory(
          project.canonicalRoot,
          join(project.canonicalRoot, ...relativePath),
          'directory',
          diagnostics,
          true,
        )
        if (source)
          sources.push(source)
      }
    }
    const global = await resolveSourceDirectory(
      this.#agentDirectory,
      globalSkillsDirectory,
      'global',
      diagnostics,
    )
    if (global)
      sources.push(global)
    return sources
  }
}

export interface SkillRpcRegistrar {
  onRequest: (method: string, handler: RuntimeRequestHandler) => () => void
}

export function registerSkillServiceRpc(
  rpc: SkillRpcRegistrar,
  service: SkillService,
): () => void {
  return rpc.onRequest('skills.list', async () => {
    const result = await service.load()
    return {
      diagnostics: result.diagnostics,
      skills: result.skills,
    }
  })
}

async function resolveSourceDirectory(
  allowedRoot: string,
  directory: string,
  source: BuddySkillSource,
  diagnostics: BuddySkillDiagnostic[],
  optional = false,
): Promise<SkillSourceDirectory | null> {
  try {
    const canonicalAllowedRoot = await realpath(allowedRoot)
    const resolution = await resolveGrantedPath([{
      canonicalRoot: canonicalAllowedRoot,
      projectId: source,
      root: canonicalAllowedRoot,
    }], directory, 'existing')
    return {
      directory: resolution.canonicalPath,
      source,
    }
  }
  catch (error) {
    if (optional && error instanceof GrantedPathError && error.code === 'PATH_NOT_FOUND')
      return null
    diagnostics.push(error instanceof GrantedPathError && error.code === 'PATH_OUTSIDE_GRANTED_DIRECTORY'
      ? {
          code: 'SKILL_PATH_OUTSIDE_SOURCE',
          message: 'A Lexora Buddy skill path leaves its allowed source directory',
        }
      : {
          code: 'SKILL_SOURCE_UNREADABLE',
          message: 'A Lexora Buddy skill source could not be read',
        })
    return null
  }
}

async function loadSource(
  source: SkillSourceDirectory,
  diagnostics: BuddySkillDiagnostic[],
): Promise<LoadedBuddySkill[]> {
  const result = loadSkillsFromDir({
    dir: source.directory,
    source: `lexora-${source.source}`,
  })
  for (const _diagnostic of result.diagnostics) {
    diagnostics.push({
      code: 'SKILL_INVALID',
      message: 'A Lexora Buddy skill has invalid metadata',
    })
  }

  const loaded: LoadedBuddySkill[] = []
  for (const skill of result.skills) {
    const path = await validateSkillPath(skill, source, diagnostics)
    if (!path)
      continue
    let content: Buffer
    try {
      content = await readBoundedFile(source.directory, path)
    }
    catch {
      diagnostics.push({
        code: 'SKILL_SOURCE_UNREADABLE',
        message: 'A Lexora Buddy skill source could not be read',
      })
      continue
    }
    loaded.push({
      catalog: {
        description: skill.description,
        enabled: true,
        name: skill.name,
        source: source.source,
      },
      contentHash: createHash('sha256').update(content).digest('hex'),
      path,
      readRoot: source.directory,
    })
  }
  return loaded
}

function createSkillRevision(skills: readonly LoadedBuddySkill[]): string {
  const hash = createHash('sha256')
  for (const skill of skills) {
    hash.update(skill.catalog.name)
    hash.update('\0')
    hash.update(skill.catalog.source)
    hash.update('\0')
    hash.update(skill.path)
    hash.update('\0')
    hash.update(skill.contentHash)
    hash.update('\0')
  }
  return hash.digest('hex')
}

export class BuddySkillSelectionError extends Error {
  readonly code: 'SKILL_NOT_FOUND' | 'SKILL_TOO_LARGE' | 'SKILL_UNREADABLE'

  constructor(code: BuddySkillSelectionError['code'], options?: ErrorOptions) {
    super('Lexora Buddy cannot materialize the selected skill', options)
    this.name = 'BuddySkillSelectionError'
    this.code = code
  }
}

function escapeXmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

async function validateSkillPath(
  skill: Skill,
  source: SkillSourceDirectory,
  diagnostics: BuddySkillDiagnostic[],
): Promise<string | null> {
  try {
    const resolution = await resolveGrantedPath([{
      canonicalRoot: source.directory,
      projectId: source.source,
      root: source.directory,
    }], skill.filePath, 'existing')
    return resolution.canonicalPath
  }
  catch {
    diagnostics.push({
      code: 'SKILL_PATH_OUTSIDE_SOURCE',
      message: 'A Lexora Buddy skill path leaves its allowed source directory',
    })
    return null
  }
}
