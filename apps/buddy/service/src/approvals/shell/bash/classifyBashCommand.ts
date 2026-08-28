import type { ShellCommandClassification } from '../shellCommandClassification'
import { requireShellApproval } from '../shellCommandClassification'
import { classifyBashSimpleCommand } from './bashCommandRules'
import { parseBashCommandList } from './parseBashCommandList'

export function classifyBashCommand(
  command: string,
  platform: NodeJS.Platform,
): ShellCommandClassification {
  const commands = parseBashCommandList(command)
  if (!commands?.length)
    return requireShellApproval('unsupported-syntax')
  for (const words of commands) {
    const reason = classifyBashSimpleCommand(words, platform)
    if (reason)
      return requireShellApproval(reason)
  }
  return { type: 'auto-approve' }
}
