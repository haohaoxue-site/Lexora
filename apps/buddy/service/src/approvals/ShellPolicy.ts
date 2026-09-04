import type { ShellDialect } from './shell/classifyShellCommand'
import type { ShellCommandPolicy, ToolDecision } from './toolPolicyContract'
import process from 'node:process'
import {
  classifyShellCommand,
  isRecognizableSystemMutation,
} from './shell/classifyShellCommand'

export interface ShellPolicyOptions {
  dialect: ShellDialect
  platform?: NodeJS.Platform
}

export class ShellPolicy implements ShellCommandPolicy {
  readonly #dialect: ShellDialect
  readonly #platform: NodeJS.Platform

  constructor(options: ShellPolicyOptions) {
    this.#dialect = options.dialect
    this.#platform = options.platform ?? process.platform
  }

  decide(command: string): ToolDecision {
    if (classifyShellCommand(this.#dialect, command, this.#platform).type === 'auto-approve')
      return { type: 'allow' }
    return {
      forceAsk: isRecognizableSystemMutation(this.#dialect, command),
      type: 'ask',
      kind: 'shell',
      summary: 'Run a host shell command from the current workspace',
    }
  }
}
