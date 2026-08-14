import type { BoundedContextFilesResult } from './loadBoundedContextFiles'
import type { SkillService } from './SkillService'
import { createHash } from 'node:crypto'

import { loadBoundedContextFiles } from './loadBoundedContextFiles'

export interface BuddySessionResources {
  approvedSkillPaths: readonly string[]
  context: BoundedContextFilesResult
  projectInstructions: string
  revision: string
}

export interface ResolveBuddySessionResourcesOptions {
  canonicalRoot: string
  cwd: string
  projectInstructions?: string
  projectId: string | null
  skills: SkillService
}

export async function resolveBuddySessionResources(
  options: ResolveBuddySessionResourcesOptions,
): Promise<BuddySessionResources> {
  const [skills, context] = await Promise.all([
    options.skills.loadForProject(options.projectId),
    loadBoundedContextFiles({
      canonicalRoot: options.canonicalRoot,
      cwd: options.cwd,
    }),
  ])
  const hash = createHash('sha256')
  const projectInstructions = options.projectInstructions?.trim() ?? ''
  hash.update(skills.revision)
  hash.update('\0')
  hash.update(projectInstructions)
  hash.update('\0')
  for (const file of context.agentsFiles) {
    hash.update(file.path)
    hash.update('\0')
    hash.update(file.content)
    hash.update('\0')
  }
  return {
    approvedSkillPaths: skills.paths,
    context,
    projectInstructions,
    revision: hash.digest('hex'),
  }
}
