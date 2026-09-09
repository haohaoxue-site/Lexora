import type { ShellDialect } from './shell/classifyShellCommand'
import type { ShellCommandPolicy, ToolDecision } from './toolPolicyContract'
import process from 'node:process'
import {
  classifyShellCommand,
  isRecognizableSystemMutation,
} from './shell/classifyShellCommand'
import { inspectGitQuery } from './shell/inspectGitQuery'

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

  async decide(command: string, cwd: string): Promise<ToolDecision> {
    const classification = classifyShellCommand(this.#dialect, command, this.#platform)
    const inspection = classification.type === 'auto-approve' && classification.git
      ? await inspectGitQuery(cwd, classification.gitDiffs ?? [])
      : null
    const readFiles = inspection && 'paths' in inspection ? inspection.paths : []
    const reason = classification.type === 'approval-required'
      ? classification.reason
      : inspection && 'reason' in inspection ? inspection.reason : null
    if (!reason && classification.type === 'auto-approve') {
      return {
        type: 'allow',
        ...(classification.readPaths?.length ? { readPaths: classification.readPaths } : {}),
        ...(readFiles.length ? { readFiles } : {}),
      }
    }
    const forceAsk = isRecognizableSystemMutation(this.#dialect, command)
    return {
      forceAsk,
      type: 'ask',
      kind: 'shell',
      reason: forceAsk ? 'system-mutation' : reason ?? 'unsupported-syntax',
      ...(classification.readPaths?.length ? { readPaths: classification.readPaths } : {}),
      ...(readFiles.length ? { readFiles } : {}),
      summary: 'Run a host shell command from the current workspace',
    }
  }
}
