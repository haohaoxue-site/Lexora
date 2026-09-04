import type { ShellCommandClassification } from './shellCommandClassification'
import { classifyBashCommand } from './bash/classifyBashCommand'
import { parseBashCommandList } from './bash/parseBashCommandList'
import { classifyPowerShellCommand } from './powershell/classifyPowerShellCommand'
import { parsePowerShellPipeline } from './powershell/parsePowerShellPipeline'

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

const bashSystemMutationCommands = new Set([
  'halt',
  'kill',
  'killall',
  'pkill',
  'poweroff',
  'reboot',
  'service',
  'shutdown',
])
const systemctlMutationOperations = new Set([
  'disable',
  'enable',
  'kill',
  'mask',
  'reload',
  'restart',
  'start',
  'stop',
  'try-restart',
  'unmask',
])
const bashCommandWrappers = new Set([
  'command',
  'doas',
  'env',
  'ionice',
  'nice',
  'nohup',
  'setsid',
  'sudo',
  'time',
  'timeout',
])
const bashShellCommands = new Set(['bash', 'sh', 'zsh'])
const powerShellSystemMutationCommands = new Set([
  'restart-computer',
  'restart-service',
  'start-service',
  'stop-computer',
  'stop-process',
  'stop-service',
])

export function isRecognizableSystemMutation(
  dialect: ShellDialect,
  command: string,
): boolean {
  const commands = dialect === 'powershell'
    ? parsePowerShellPipeline(command)
    : parseBashCommandList(command)
  if (!commands)
    return false
  return dialect === 'powershell'
    ? commands.some(words => powerShellSystemMutationCommands.has(
        normalizeExecutable(words[0]) ?? '',
      ))
    : commands.some(isBashSystemMutation)
}

function isBashSystemMutation(words: readonly string[]): boolean {
  const commandIndex = words.findIndex(word => !/^[A-Z_][A-Z0-9_]*=.*/.test(word))
  const command = normalizeExecutable(words[commandIndex])
  if (!command)
    return false
  if (bashSystemMutationCommands.has(command))
    return true
  if (command === 'systemctl')
    return hasSystemctlMutation(words, commandIndex)

  const nestedShellIndex = words.findIndex((word, index) => (
    index >= commandIndex && bashShellCommands.has(normalizeExecutable(word) ?? '')
  ))
  if (nestedShellIndex >= 0) {
    const commandFlagIndex = words.indexOf('-c', nestedShellIndex + 1)
    const nestedCommand = commandFlagIndex >= 0 ? words[commandFlagIndex + 1] : undefined
    if (nestedCommand && isRecognizableSystemMutation('bash', nestedCommand))
      return true
  }

  if (!bashCommandWrappers.has(command))
    return false
  return words.some((word, index) => {
    if (index <= commandIndex)
      return false
    const executable = normalizeExecutable(word)
    return executable !== null && (
      bashSystemMutationCommands.has(executable)
      || (executable === 'systemctl' && hasSystemctlMutation(words, index))
    )
  })
}

function hasSystemctlMutation(words: readonly string[], commandIndex: number): boolean {
  return words.slice(commandIndex + 1).some(word => (
    systemctlMutationOperations.has(word.toLowerCase())
  ))
}

function normalizeExecutable(word: string | undefined): string | null {
  if (!word)
    return null
  return word.split(/[\\/]/).at(-1)?.toLowerCase() ?? null
}
