import type { ToolDecision } from './ToolPolicy'

const READ_ONLY_SHELL_COMMANDS = new Set([
  'ls',
  'ls -la',
  'ls -lah',
  'pwd',
  'rg --files',
  'rg --files .',
])

export class ShellPolicy {
  decide(command: string): ToolDecision {
    const normalized = command.trim().replaceAll(/\s+/g, ' ')
    if (READ_ONLY_SHELL_COMMANDS.has(normalized))
      return { type: 'allow' }
    return {
      type: 'ask',
      kind: 'shell',
      summary: 'Run a shell command in the authorized directory',
    }
  }
}
