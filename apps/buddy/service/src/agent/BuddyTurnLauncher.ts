import type { RunLifecycleService } from '../runs/RunLifecycleService'
import type { BuddyTurnHandle } from './BuddyAgentRun'
import type { BuddyAgentRunner } from './BuddyAgentRunner'
import type { BuddyRunExecutionPlanner } from './BuddyRunExecutionPlanner'

export interface BuddyTurnLauncherOptions {
  lifecycle: Pick<RunLifecycleService, 'failBeforeStart'>
  planner: Pick<BuddyRunExecutionPlanner, 'resolve'>
  runner: Pick<BuddyAgentRunner, 'startCompaction' | 'startTurn'>
}

export class BuddyTurnLauncher {
  readonly #options: BuddyTurnLauncherOptions

  constructor(options: BuddyTurnLauncherOptions) {
    this.#options = options
  }

  async launch(runId: string): Promise<BuddyTurnHandle> {
    let plan: Awaited<ReturnType<BuddyRunExecutionPlanner['resolve']>>
    try {
      plan = await this.#options.planner.resolve(runId)
    }
    catch (error) {
      const failed = await this.#options.lifecycle.failBeforeStart(runId, error)
      if (!failed)
        throw error
      return { completion: Promise.resolve(failed), runId }
    }
    return plan.kind === 'turn'
      ? this.#options.runner.startTurn(plan.input)
      : this.#options.runner.startCompaction(plan.input)
  }
}
