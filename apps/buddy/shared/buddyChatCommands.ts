export type BuddyChatCommandKind = 'action' | 'prompt'
export type BuddyChatCommandName = 'compact' | 'plan' | 'review' | 'skills' | 'status'
export type BuddyChatCommandDescriptionKey = `desktop.chat.command.${BuddyChatCommandName}`

export interface BuddyChatCommandDefinition {
  argumentHint: string | null
  descriptionKey: BuddyChatCommandDescriptionKey
  kind: BuddyChatCommandKind
  name: BuddyChatCommandName
}

export type ParsedBuddyChatCommand = {
  arguments: string
  kind: 'action'
  name: 'compact'
} | {
  arguments: string
  kind: 'prompt'
  name: Exclude<BuddyChatCommandName, 'compact'>
}

export const BUDDY_CHAT_COMMANDS: ReadonlyArray<BuddyChatCommandDefinition> = [
  {
    argumentHint: 'focus',
    descriptionKey: 'desktop.chat.command.compact',
    kind: 'action',
    name: 'compact',
  },
  {
    argumentHint: null,
    descriptionKey: 'desktop.chat.command.plan',
    kind: 'prompt',
    name: 'plan',
  },
  {
    argumentHint: null,
    descriptionKey: 'desktop.chat.command.review',
    kind: 'prompt',
    name: 'review',
  },
  {
    argumentHint: null,
    descriptionKey: 'desktop.chat.command.status',
    kind: 'prompt',
    name: 'status',
  },
  {
    argumentHint: null,
    descriptionKey: 'desktop.chat.command.skills',
    kind: 'prompt',
    name: 'skills',
  },
]

const commandsByName = new Map(BUDDY_CHAT_COMMANDS.map(command => [command.name, command]))
const promptInstructions: Record<Exclude<BuddyChatCommandName, 'compact'>, string> = {
  plan: '先梳理目标、约束、依赖与实施步骤，再继续执行。',
  review: '严格检查当前工作，按严重程度给出有证据的风险与改进建议。',
  skills: '说明当前任务实际可用且相关的 Lexora Buddy Skills，并解释使用边界。',
  status: '概括当前任务目标、已完成进度、未解决问题与下一步。',
}

export function parseBuddyChatCommand(value: string): ParsedBuddyChatCommand | null {
  const normalized = value.trimStart()
  const separatorIndex = normalized.search(/\s/u)
  const invocation = separatorIndex < 0 ? normalized : normalized.slice(0, separatorIndex)
  const match = /^\/([a-z][a-z-]*)$/i.exec(invocation)
  if (!match)
    return null
  const definition = commandsByName.get(match[1]!.toLowerCase() as BuddyChatCommandName)
  if (!definition)
    return null
  return {
    arguments: separatorIndex < 0 ? '' : normalized.slice(separatorIndex).trim(),
    kind: definition.kind,
    name: definition.name,
  } as ParsedBuddyChatCommand
}

export function materializeBuddyPromptCommand(command: ParsedBuddyChatCommand): string {
  if (command.kind !== 'prompt')
    throw new BuddyChatCommandError('Cannot materialize an action command as model input')
  const instruction = promptInstructions[command.name]
  return command.arguments
    ? `Lexora Buddy 指令：${instruction}\n\n用户补充：${command.arguments}`
    : `Lexora Buddy 指令：${instruction}`
}

export class BuddyChatCommandError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BuddyChatCommandError'
  }
}
