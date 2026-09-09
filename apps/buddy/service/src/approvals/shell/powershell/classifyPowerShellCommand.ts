import type { ShellCommandClassification } from '../shellCommandClassification'
import { classifyGitCommand } from '../gitCommandRules'
import { requireShellApproval } from '../shellCommandClassification'
import { parsePowerShellPipeline } from './parsePowerShellPipeline'
import { classifyPowerShellSimpleCommand } from './powerShellCommandRules'

export function classifyPowerShellCommand(command: string): ShellCommandClassification {
  const commands = parsePowerShellPipeline(command)
  if (!commands?.length)
    return requireShellApproval('unsupported-syntax')
  const result: Extract<ShellCommandClassification, { type: 'auto-approve' }> = { type: 'auto-approve' }
  let required: Extract<ShellCommandClassification, { type: 'approval-required' }> | undefined
  for (const words of commands) {
    if (['git', 'git.exe'].includes(words[0]?.toLowerCase() ?? '')) {
      const classification = classifyGitCommand(words.slice(1))
      if (classification.type === 'approval-required') {
        required ??= classification
        continue
      }
      result.git = true
      result.readPaths = [...new Set([...result.readPaths ?? [], ...classification.readPaths ?? []])]
      if (classification.gitDiffs?.length)
        result.gitDiffs = [...result.gitDiffs ?? [], ...classification.gitDiffs]
      continue
    }
    const reason = classifyPowerShellSimpleCommand(words)
    if (reason)
      required ??= { type: 'approval-required', reason }
  }
  return required
    ? { ...required, ...(result.readPaths?.length ? { readPaths: result.readPaths } : {}) }
    : result
}
