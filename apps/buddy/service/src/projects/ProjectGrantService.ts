import type {
  ProjectMemoryScope,
  ProjectRecord,
  ProjectRepository,
} from '../storage/projectRepository'
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, realpath, rm, stat } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
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
  root: string | null
}

export interface UpdateProjectInput extends CreateProjectInput {
  projectId: string
}

export class ProjectGrantService {
  readonly #managedProjectsDirectory: string | null
  readonly #projects: ProjectRepository

  constructor(projects: ProjectRepository, options: { managedProjectsDirectory?: string } = {}) {
    this.#projects = projects
    this.#managedProjectsDirectory = options.managedProjectsDirectory ?? null
  }

  async create(input: CreateProjectInput): Promise<ProjectRecord> {
    const name = input.name.trim()
    if (!name)
      throw new ProjectGrantError()
    if (!this.#managedProjectsDirectory)
      throw new ProjectGrantError()

    const id = randomUUID()
    const directory = input.root
      ? await resolveProjectDirectory(input.root)
      : null
    const managedRoot = join(this.#managedProjectsDirectory, id, 'workspace')
    await mkdir(managedRoot, { mode: 0o700, recursive: true })
    const canonicalManagedRoot = await resolveDirectoryRoot(managedRoot)
    const authorizedAt = new Date().toISOString()
    return this.#projects.create({
      authorizedAt,
      directory,
      id,
      instructions: input.instructions,
      managedRoot: canonicalManagedRoot,
      memoryScope: input.memoryScope,
      name,
    })
  }

  async update(input: UpdateProjectInput): Promise<ProjectRecord> {
    const project = this.#requireActiveProject(input.projectId)
    const name = input.name.trim()
    if (!name)
      throw new ProjectGrantError()
    const directory = input.root
      ? await resolveProjectDirectory(input.root)
      : null
    const updatedAt = new Date().toISOString()
    return this.#projects.update({
      directory,
      event: {
        createdAt: updatedAt,
        eventType: 'project.config.updated',
        id: randomUUID(),
        payload: {
          changes: {
            directory: {
              from: project.directoryRoot,
              to: directory?.root ?? null,
            },
            instructions: project.instructions === input.instructions ? 'unchanged' : 'changed',
            memoryScope: {
              from: project.memoryScope,
              to: input.memoryScope,
            },
            name: {
              from: project.name,
              to: name,
            },
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
    const deleted = this.#projects.delete(projectId, deletedAt, {
      createdAt: deletedAt,
      eventType: 'project.deleted',
      id: randomUUID(),
      payload: {
        directoryRoot: project.directoryRoot,
        memoryScope: project.memoryScope,
        name: project.name,
      },
      projectId,
    })
    await this.#deleteManagedProjectData(project)
    if (!project.managedRoot)
      return deleted
    if (!this.#projects.completeDeletion(projectId, new Date().toISOString()))
      throw new ProjectGrantError()
    return this.#projects.findById(projectId) ?? deleted
  }

  async recoverPendingDeletions(): Promise<number> {
    const projects = this.#projects.list().filter(project => (
      project.revokedAt !== null && project.managedRoot !== null
    ))
    for (const project of projects) {
      await this.#deleteManagedProjectData(project)
      if (!this.#projects.completeDeletion(project.id, new Date().toISOString()))
        throw new ProjectGrantError()
    }
    return projects.length
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

  async #deleteManagedProjectData(project: ProjectRecord): Promise<void> {
    if (!project.managedRoot || !this.#managedProjectsDirectory)
      return
    const projectDirectory = dirname(project.managedRoot)
    const expectedDirectory = resolve(this.#managedProjectsDirectory, project.id)
    if (resolve(projectDirectory) !== expectedDirectory)
      throw new ProjectGrantError()
    await rm(projectDirectory, { force: true, recursive: true })
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
