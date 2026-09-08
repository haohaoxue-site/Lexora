import type {
  ChatAgentCompactionNode,
  ChatAgentNarrationNode,
  ChatAgentReasoningNode,
  ChatAgentToolNode,
  ChatAgentTurnNode,
} from './chatAgentTurn'

export interface ChatAgentReasoningGroup {
  entries: ChatAgentReasoningNode[]
  id: string
  kind: 'reasoning-group'
}

export type ChatAgentTurnRow
  = | ChatAgentCompactionNode
    | ChatAgentNarrationNode
    | ChatAgentReasoningGroup
    | ChatAgentToolNode

export function projectChatAgentTurnRows(nodes: ReadonlyArray<ChatAgentTurnNode>): ChatAgentTurnRow[] {
  const rows: ChatAgentTurnRow[] = []
  let reasoning: ChatAgentReasoningNode[] = []
  const flushReasoning = () => {
    if (reasoning.length === 0)
      return
    rows.push({
      entries: reasoning,
      id: `reasoning-group:${reasoning[0]!.id}`,
      kind: 'reasoning-group',
    })
    reasoning = []
  }

  for (const node of nodes) {
    if (node.kind === 'reasoning') {
      reasoning.push(node)
      continue
    }
    flushReasoning()
    rows.push(node)
  }
  flushReasoning()
  return rows
}

export function createChatAgentTurnRowProjector() {
  let source: ReadonlyArray<ChatAgentTurnNode> | null = null
  let rows: ReadonlyArray<ChatAgentTurnRow> = []

  function project(nodes: ReadonlyArray<ChatAgentTurnNode>): ReadonlyArray<ChatAgentTurnRow> {
    if (nodes === source)
      return rows
    const previousById = new Map(rows.map(row => [row.id, row]))
    rows = projectChatAgentTurnRows(nodes).map((row) => {
      const previous = previousById.get(row.id)
      return previous && isSameChatAgentTurnRow(previous, row) ? previous : row
    })
    source = nodes
    return rows
  }

  return { project }
}

function isSameChatAgentTurnRow(
  previous: ChatAgentTurnRow,
  current: ChatAgentTurnRow,
): boolean {
  if (previous === current)
    return true
  if (previous.kind !== 'reasoning-group' || current.kind !== 'reasoning-group')
    return false
  return previous.entries.length === current.entries.length
    && previous.entries.every((entry, index) => entry === current.entries[index])
}
