import type { ShellCommandPolicy, ToolDecision } from './toolPolicyContract'
import { isReadOnlyShellCommand } from './readOnlyShellCommand'

export class ShellPolicy implements ShellCommandPolicy {
  decide(command: string): ToolDecision {
    if (isReadOnlyShellCommand(command))
      return { type: 'allow' }
    return {
      type: 'ask',
      kind: 'shell',
      summary: 'Run a host shell command from the current workspace',
    }
  }
}
