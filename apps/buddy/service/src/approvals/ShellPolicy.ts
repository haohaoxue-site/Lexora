import type { ToolDecision } from './ToolPolicy'
import { isReadOnlyShellCommand } from './readOnlyShellCommand'

export class ShellPolicy {
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
