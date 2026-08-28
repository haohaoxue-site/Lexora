import type { Automation } from '../../../shared/automation'
import type { AutomationService } from './AutomationService'

export interface AutomationChangeCoordinatorOptions {
  notify: (automationId: string) => void
  service: Pick<AutomationService, 'blockPinnedModel' | 'blockProject' | 'list'>
  wakeScheduler: () => Promise<void> | void | undefined
}

export interface AutomationDependencyAvailability {
  isPinnedModelAvailable: (providerId: string, modelId: string) => boolean
  isProjectAvailable: (projectId: string) => boolean
}

export class AutomationChangeCoordinator {
  readonly #notify: AutomationChangeCoordinatorOptions['notify']
  readonly #service: AutomationChangeCoordinatorOptions['service']
  readonly #wakeScheduler: AutomationChangeCoordinatorOptions['wakeScheduler']

  constructor(options: AutomationChangeCoordinatorOptions) {
    this.#notify = options.notify
    this.#service = options.service
    this.#wakeScheduler = options.wakeScheduler
  }

  blockPinnedModel(providerId: string, modelId?: string): Automation[] {
    return this.#publishAll(this.#service.blockPinnedModel(providerId, modelId))
  }

  blockProject(projectId: string): Automation[] {
    return this.#publishAll(this.#service.blockProject(projectId))
  }

  publish(automationId: string): void {
    this.#notify(automationId)
    void this.#wakeScheduler()
  }

  publishSchedulerChange(automationId: string): void {
    this.#notify(automationId)
  }

  reconcileDependencies(availability: AutomationDependencyAvailability): Automation[] {
    const active = this.#listActive()
    const blocked = new Map<string, Automation>()
    const blockedProjects = new Set<string>()
    const blockedModels = new Set<string>()

    for (const automation of active) {
      if (
        automation.projectId
        && !availability.isProjectAvailable(automation.projectId)
        && !blockedProjects.has(automation.projectId)
      ) {
        blockedProjects.add(automation.projectId)
        for (const item of this.#service.blockProject(automation.projectId))
          blocked.set(item.id, item)
        continue
      }
      if (automation.model.mode !== 'pinned')
        continue
      if (availability.isPinnedModelAvailable(
        automation.model.providerId,
        automation.model.modelId,
      )) {
        continue
      }
      const modelKey = `${automation.model.providerId}\0${automation.model.modelId}`
      if (blockedModels.has(modelKey))
        continue
      blockedModels.add(modelKey)
      for (const item of this.#service.blockPinnedModel(
        automation.model.providerId,
        automation.model.modelId,
      )) {
        blocked.set(item.id, item)
      }
    }

    return this.#publishAll([...blocked.values()])
  }

  wakeScheduler(): void {
    void this.#wakeScheduler()
  }

  #listActive(): Automation[] {
    const active: Automation[] = []
    let cursor: string | null = null
    do {
      const page = this.#service.list({
        cursor,
        limit: 100,
        statuses: ['active'],
      })
      active.push(...page.items)
      cursor = page.nextCursor
    } while (cursor)
    return active
  }

  #publishAll(automations: Automation[]): Automation[] {
    if (automations.length === 0)
      return automations
    for (const automation of automations)
      this.#notify(automation.id)
    void this.#wakeScheduler()
    return automations
  }
}
