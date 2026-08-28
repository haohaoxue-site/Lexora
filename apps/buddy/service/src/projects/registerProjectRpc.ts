import type { AutomationChangeCoordinator } from '../automations/AutomationChangeCoordinator'
import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type { ProjectRecord, ProjectRepository } from '../storage/projectRepository'
import type { ProjectGrantService } from './ProjectGrantService'
import { z } from 'zod'
import { BuddyServiceError, ok, parse } from '../rpc/runtimeRequest'

const idSchema = z.string().trim().min(1).max(256)
const projectInputSchema = z.object({
  instructions: z.string().trim().max(64 * 1024),
  memoryScope: z.enum(['personal_and_project', 'project_only']),
  name: z.string().trim().min(1).max(80),
  root: z.string().min(1),
}).strict()
const projectIdSchema = z.object({ projectId: idSchema }).strict()
const projectListSchema = z.object({
  limit: z.number().int().positive().max(500).optional(),
}).strict()
const projectSearchSchema = z.object({
  projectId: idSchema,
  query: z.string().max(512),
}).strict()
const projectUpdateSchema = projectInputSchema.extend({ projectId: idSchema }).strict()

export interface ProjectSessionInvalidator {
  invalidateRoot: (canonicalRoot: string) => Promise<unknown>
}

export interface RegisterProjectRpcOptions {
  automations: Pick<AutomationChangeCoordinator, 'blockProject'>
  projects: Pick<ProjectRepository, 'findById'>
  rpc: RuntimeRequestRegistrar
  service: ProjectGrantService
  sessions: ProjectSessionInvalidator
}

export function registerProjectRpc(options: RegisterProjectRpcOptions): () => void {
  const disposers: Array<() => void> = []
  const on = (method: string, handler: (params: unknown) => Promise<unknown> | unknown) => {
    disposers.push(options.rpc.onRequest(method, handler))
  }

  on('projects.create', (params) => {
    return options.service.create(parse(projectInputSchema, params))
  })
  on('projects.update', async (params) => {
    const input = parse(projectUpdateSchema, params)
    const current = requireActiveProject(options.projects.findById(input.projectId))
    const updated = await options.service.update(input)
    await options.sessions.invalidateRoot(current.canonicalRoot)
    return updated
  })
  on('projects.delete', async (params) => {
    const input = parse(projectIdSchema, params)
    const current = requireActiveProject(options.projects.findById(input.projectId))
    await options.service.delete(input.projectId)
    options.automations.blockProject(input.projectId)
    await options.sessions.invalidateRoot(current.canonicalRoot)
    return ok()
  })
  on('projects.list', (params) => {
    const input = parse(projectListSchema, params)
    return options.service.list().slice(0, input.limit ?? 100)
  })
  on('projects.searchFiles', (params) => {
    const input = parse(projectSearchSchema, params)
    return options.service.searchFiles(input.projectId, input.query)
  })

  return () => disposers.splice(0).forEach(dispose => dispose())
}

function requireActiveProject(project: ProjectRecord | null): ProjectRecord {
  if (!project || project.revokedAt !== null)
    throw new BuddyServiceError('VALIDATION_FAILED')
  return project
}
