import type { ShellCommandClassification } from '../shellCommandClassification'
import { requireShellApproval } from '../shellCommandClassification'
import { parsePowerShellPipeline } from './parsePowerShellPipeline'
import { classifyPowerShellSimpleCommand } from './powerShellCommandRules'

export function classifyPowerShellCommand(command: string): ShellCommandClassification {
  const commands = parsePowerShellPipeline(command)
  if (!commands?.length)
    return requireShellApproval('unsupported-syntax')
  for (const words of commands) {
    const reason = classifyPowerShellSimpleCommand(words)
    if (reason)
      return requireShellApproval(reason)
  }
  return { type: 'auto-approve' }
}
