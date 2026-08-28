import type { ShellCommandClassification } from './shellCommandClassification'
import { classifyBashCommand } from './bash/classifyBashCommand'
import { classifyPowerShellCommand } from './powershell/classifyPowerShellCommand'

export type ShellDialect = 'bash' | 'powershell'

export function classifyShellCommand(
  dialect: ShellDialect,
  command: string,
  platform: NodeJS.Platform,
): ShellCommandClassification {
  return dialect === 'powershell'
    ? classifyPowerShellCommand(command)
    : classifyBashCommand(command, platform)
}
