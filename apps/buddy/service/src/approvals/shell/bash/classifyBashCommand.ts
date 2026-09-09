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
  const result: Extract<ShellCommandClassification, { type: 'auto-approve' }> = { type: 'auto-approve' }
  let required: Extract<ShellCommandClassification, { type: 'approval-required' }> | undefined
  for (const words of commands) {
    const classification = classifyBashSimpleCommand(words, platform)
    if (classification.type === 'approval-required')
      required ??= classification
    if (classification.type === 'auto-approve' && classification.git)
      result.git = true
    if (classification.readPaths?.length)
      result.readPaths = [...new Set([...result.readPaths ?? [], ...classification.readPaths])]
    if (classification.type === 'auto-approve' && classification.gitDiffs?.length)
      result.gitDiffs = [...result.gitDiffs ?? [], ...classification.gitDiffs]
  }
  return required
    ? { ...required, ...(result.readPaths?.length ? { readPaths: result.readPaths } : {}) }
    : result
}
