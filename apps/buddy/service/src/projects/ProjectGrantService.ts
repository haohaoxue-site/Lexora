import type {
  ProjectMemoryScope,
  ProjectRecord,
  ProjectRepository,
} from '../storage/projectRepository'
import { randomUUID } from 'node:crypto'
import { readdir, realpath, stat } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { resolveGrantedPath } from './resolveGrantedPath'

const IGNORED_SEARCH_DIRECTORIES = new Set(['.git', 'dist', 'node_modules', 'out', 'target'])
const MAX_SEARCHED_ENTRIES = 5_000
const MAX_SEARCH_RESULTS = 50

export interface ProjectFileSearchResult {
  name: string
  relativePath: string
}

export interface CreateProjectInput {
  instructions: string
  memoryScope: ProjectMemoryScope
  name: string
  root: string
}

export interface UpdateProjectInput extends CreateProjectInput {
  projectId: string
}

export class ProjectGrantService {
  readonly #projects: ProjectRepository

  constructor(projects: ProjectRepository) {
    this.#projects = projects
  }

  async create(input: CreateProjectInput): Promise<ProjectRecord> {
    const name = input.name.trim()
    if (!name)
      throw new ProjectGrantError()
    const authorizedAt = new Date().toISOString()
    return this.#projects.create({
      authorizedAt,
      directory: await resolveProjectDirectory(input.root),
      id: randomUUID(),
      instructions: input.instructions,
      memoryScope: input.memoryScope,
      name,
    })
  }

  async update(input: UpdateProjectInput): Promise<ProjectRecord> {
    const project = this.#requireActiveProject(input.projectId)
    const name = input.name.trim()
    if (!name)
      throw new ProjectGrantError()
    const directory = await resolveProjectDirectory(input.root)
    const updatedAt = new Date().toISOString()
    return this.#projects.update({
      directory,
      event: {
        createdAt: updatedAt,
        eventType: 'project.config.updated',
        id: randomUUID(),
        payload: {
          changes: {
            directory: { from: project.root, to: directory.root },
            instructions: project.instructions === input.instructions ? 'unchanged' : 'changed',
            memoryScope: { from: project.memoryScope, to: input.memoryScope },
            name: { from: project.name, to: name },
          },
        },
        projectId: project.id,
      },
      id: project.id,
      instructions: input.instructions,
      memoryScope: input.memoryScope,
      name,
      updatedAt,
    })
  }

  async delete(projectId: string): Promise<ProjectRecord> {
    const project = this.#requireActiveProject(projectId)
    if (this.#projects.hasActiveRuns(projectId))
      throw new ProjectHasActiveRunsError()
    const deletedAt = new Date().toISOString()
    return this.#projects.delete(projectId, deletedAt, {
      createdAt: deletedAt,
      eventType: 'project.deleted',
      id: randomUUID(),
      payload: {
        memoryScope: project.memoryScope,
        name: project.name,
        root: project.root,
      },
      projectId,
    })
  }

  list(): readonly ProjectRecord[] {
    return this.#projects.list()
  }

  async searchFiles(projectId: string, query: string): Promise<ProjectFileSearchResult[]> {
    const project = this.#requireActiveProject(projectId)
    const normalizedQuery = query.trim().toLocaleLowerCase()
    const results: ProjectFileSearchResult[] = []
    const pending = [project.canonicalRoot]
    let searched = 0
    while (pending.length > 0 && searched < MAX_SEARCHED_ENTRIES && results.length < MAX_SEARCH_RESULTS) {
      const directory = pending.shift()
      if (!directory)
        break
      const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
      for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        searched += 1
        if (searched > MAX_SEARCHED_ENTRIES)
          break
        const candidate = join(directory, entry.name)
        if (entry.isDirectory() && !IGNORED_SEARCH_DIRECTORIES.has(entry.name)) {
          pending.push(candidate)
          continue
        }
        if (!entry.isFile())
          continue
        const relativePath = relative(project.canonicalRoot, candidate)
        if (normalizedQuery && !relativePath.toLocaleLowerCase().includes(normalizedQuery))
          continue
        try {
          await resolveGrantedPath([{
            canonicalRoot: project.canonicalRoot,
            projectId: project.id,
            root: project.root,
          }], candidate, 'existing')
          results.push({ name: entry.name, relativePath })
        }
        catch {}
        if (results.length >= MAX_SEARCH_RESULTS)
          break
      }
    }
    return results
  }

  #requireActiveProject(projectId: string): ProjectRecord {
    const project = this.#projects.findById(projectId)
    if (!project || project.revokedAt !== null)
      throw new ProjectGrantError()
    return project
  }
}

async function resolveDirectoryRoot(root: string): Promise<string> {
  const canonicalRoot = await realpath(root)
  const metadata = await stat(canonicalRoot)
  if (!metadata.isDirectory())
    throw new ProjectGrantError()
  return canonicalRoot
}

async function resolveProjectDirectory(root: string) {
  const absoluteRoot = resolve(root)
  try {
    return {
      canonicalRoot: await resolveDirectoryRoot(absoluteRoot),
      root: absoluteRoot,
    }
  }
  catch {
    throw new ProjectGrantError()
  }
}

export class ProjectGrantError extends Error {
  readonly code = 'DIRECTORY_NOT_AUTHORIZED'

  constructor() {
    super('Lexora Buddy directory is not authorized')
    this.name = 'ProjectGrantError'
  }
}

export class ProjectHasActiveRunsError extends Error {
  readonly code = 'PROJECT_HAS_ACTIVE_RUNS'

  constructor() {
    super('Lexora Buddy cannot delete a project with active runs')
    this.name = 'ProjectHasActiveRunsError'
  }
}
