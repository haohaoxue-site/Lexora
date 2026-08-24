import type { ProjectMemoryScope } from '../storage/projectRepository'
import type { AutomationService } from './AutomationService'

export interface ResolvedAutomationProject {
  canonicalRoot: string
  id: string
  instructions: string
  memoryScope: ProjectMemoryScope
}

export interface AutomationProjectBindingInput {
  automationId: string
  projectId: string | null
}

export interface AutomationProjectBindingServiceOptions {
  automations: AutomationService
  createProject: (name: string) => Promise<ResolvedAutomationProject>
  deleteProject: (projectId: string) => Promise<unknown>
  findProject: (projectId: string) => ResolvedAutomationProject | null
  onChanged?: (automationId: string) => void
}

export class AutomationProjectBindingService {
  readonly #automations: AutomationService
  readonly #createProject: AutomationProjectBindingServiceOptions['createProject']
  readonly #deleteProject: AutomationProjectBindingServiceOptions['deleteProject']
  readonly #findProject: AutomationProjectBindingServiceOptions['findProject']
  readonly #onChanged: NonNullable<AutomationProjectBindingServiceOptions['onChanged']>
  readonly #pending = new Map<string, Promise<ResolvedAutomationProject | null>>()

  constructor(options: AutomationProjectBindingServiceOptions) {
    this.#automations = options.automations
    this.#createProject = options.createProject
    this.#deleteProject = options.deleteProject
    this.#findProject = options.findProject
    this.#onChanged = options.onChanged ?? (() => {})
  }

  resolve(input: AutomationProjectBindingInput): Promise<ResolvedAutomationProject | null> {
    if (input.projectId)
      return Promise.resolve(this.#findProject(input.projectId))
    const pending = this.#pending.get(input.automationId)
    if (pending)
      return pending
    const resolution = this.#createAndBind(input).finally(() => {
      if (this.#pending.get(input.automationId) === resolution)
        this.#pending.delete(input.automationId)
    })
    this.#pending.set(input.automationId, resolution)
    return resolution
  }

  async #createAndBind(
    input: AutomationProjectBindingInput,
  ): Promise<ResolvedAutomationProject | null> {
    const automation = this.#automations.get(input.automationId)
    if (!automation)
      return null
    if (automation.projectId)
      return this.#findProject(automation.projectId)

    const project = await this.#createProject(createAutomationProjectName(automation.name))
    try {
      const bound = this.#automations.bindProjectIfUnassigned({
        automationId: automation.id,
        expectedRevision: automation.revision,
        projectId: project.id,
      })
      if (bound) {
        this.#onChanged(bound.id)
        return project
      }
    }
    catch (error) {
      await this.#deleteProject(project.id)
      throw error
    }

    await this.#deleteProject(project.id)
    const current = this.#automations.get(input.automationId)
    return current?.projectId ? this.#findProject(current.projectId) : null
  }
}

function createAutomationProjectName(automationName: string): string {
  return Array.from(`自动化：${automationName.trim()}`).slice(0, 80).join('')
}
