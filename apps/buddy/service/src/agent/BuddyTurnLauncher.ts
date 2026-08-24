import type {
  BuddyAgentRunner,
  BuddyTurnHandle,
  StartBuddyTurnInput,
} from './BuddyAgentRunner'

export class BuddyTurnLauncher {
  readonly #runner: Pick<BuddyAgentRunner, 'startTurn'>

  constructor(runner: Pick<BuddyAgentRunner, 'startTurn'>) {
    this.#runner = runner
  }

  startTurn(input: StartBuddyTurnInput): BuddyTurnHandle {
    return this.#runner.startTurn(input)
  }
}
