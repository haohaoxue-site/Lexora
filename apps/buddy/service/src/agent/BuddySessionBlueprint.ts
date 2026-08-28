import type { BuddyExecutionProfile } from '../../../shared/executionProfile'
import type { BuddySessionMode } from '../../../shared/sessionMode'
import type { ProjectGrant } from '../projects/resolveGrantedPath'
import type { BuddyDataPaths } from '../storage/BuddyDataPaths'
import type {
  ProjectMemoryScope,
  ProjectRecord,
  ProjectRepository,
} from '../storage/projectRepository'
import type { BuddySessionResources } from './BuddySessionResources'
import type { SkillService } from './SkillService'
import { mkdir, realpath, stat } from 'node:fs/promises'
import { requireGrantedProject } from '../projects/requireGrantedProject'
import { BuddyAgentRunError } from '../runs/runError'
import { resolveBuddySessionResources } from './BuddySessionResources'

export interface BuddySessionIdentity {
  branchId: string
  canonicalRoot: string
  conversationId: string
  executionProfile: BuddyExecutionProfile
  resourceRevision: string
  sessionMode: BuddySessionMode
}

export interface BuddySessionProjectSnapshot {
  id: string
  memoryScope: ProjectMemoryScope
}

export interface BuddySessionBlueprint {
  branchId: string
  canonicalRoot: string
  conversationId: string
  executionProfile: BuddyExecutionProfile
  grant: ProjectGrant
  project: BuddySessionProjectSnapshot | null
  resources: BuddySessionResources
  sessionMode: BuddySessionMode
}

export interface CreateConversationSessionBlueprintInput {
  branchId: string
  conversationId: string
  executionProfile: BuddyExecutionProfile
  projectId: string | null
  sessionMode: BuddySessionMode
}

export interface CreateDraftSessionBlueprintInput {
  draftId: string
  executionProfile: BuddyExecutionProfile
  projectId: string | null
}

export interface BuddySessionBlueprintServiceOptions {
  paths: Pick<BuddyDataPaths, 'conversationWorkspace' | 'draftAttachments'>
  projects: Pick<ProjectRepository, 'findById'>
  skills: Pick<SkillService, 'loadForProject'>
}

export class BuddySessionBlueprintService {
  readonly #options: BuddySessionBlueprintServiceOptions

  constructor(options: BuddySessionBlueprintServiceOptions) {
    this.#options = options
  }

  createForConversation(
    input: CreateConversationSessionBlueprintInput,
  ): Promise<BuddySessionBlueprint> {
    return this.#create({
      ...input,
      ownedRoot: this.#options.paths.conversationWorkspace(input.conversationId),
    })
  }

  createForDraft(input: CreateDraftSessionBlueprintInput): Promise<BuddySessionBlueprint> {
    return this.#create({
      branchId: 'context-preview',
      conversationId: input.draftId,
      executionProfile: input.executionProfile,
      ownedRoot: this.#options.paths.draftAttachments(input.draftId),
      projectId: input.projectId,
      sessionMode: 'interactive',
    })
  }

  async #create(input: CreateConversationSessionBlueprintInput & {
    ownedRoot: string
  }): Promise<BuddySessionBlueprint> {
    const project = input.projectId
      ? requireGrantedProject(this.#options.projects.findById(input.projectId))
      : null
    const canonicalRoot = project
      ? await resolveGrantedProjectRoot(project)
      : await resolveOwnedRoot(input.ownedRoot)
    const resources = await resolveBuddySessionResources({
      canonicalRoot,
      cwd: canonicalRoot,
      projectInstructions: project?.instructions,
      projectId: project?.id ?? null,
      skills: this.#options.skills,
    })

    return {
      branchId: input.branchId,
      canonicalRoot,
      conversationId: input.conversationId,
      executionProfile: input.executionProfile,
      grant: project
        ? {
            canonicalRoot: project.canonicalRoot,
            projectId: project.id,
            root: project.root,
          }
        : {
            canonicalRoot,
            projectId: input.conversationId,
            root: canonicalRoot,
          },
      project: project
        ? { id: project.id, memoryScope: project.memoryScope }
        : null,
      resources,
      sessionMode: input.sessionMode,
    }
  }
}

export function toBuddySessionIdentity(
  blueprint: BuddySessionBlueprint,
): BuddySessionIdentity {
  return {
    branchId: blueprint.branchId,
    canonicalRoot: blueprint.canonicalRoot,
    conversationId: blueprint.conversationId,
    executionProfile: blueprint.executionProfile,
    resourceRevision: blueprint.resources.revision,
    sessionMode: blueprint.sessionMode,
  }
}

async function resolveGrantedProjectRoot(project: ProjectRecord): Promise<string> {
  try {
    const canonicalRoot = await realpath(project.root)
    const metadata = await stat(canonicalRoot)
    if (canonicalRoot !== project.canonicalRoot || !metadata.isDirectory())
      throw new Error('Project directory identity changed')
    return canonicalRoot
  }
  catch {
    throw new BuddyAgentRunError('DIRECTORY_NOT_AUTHORIZED')
  }
}

async function resolveOwnedRoot(root: string): Promise<string> {
  await mkdir(root, { mode: 0o700, recursive: true })
  return realpath(root)
}
