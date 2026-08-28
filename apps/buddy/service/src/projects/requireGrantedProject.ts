import type { ProjectRecord } from '../storage/projectRepository'
import { BuddyServiceError } from '../rpc/runtimeRequest'

export function requireGrantedProject(project: ProjectRecord | null): ProjectRecord {
  if (!project || project.revokedAt !== null)
    throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
  return project
}
