type DiffLineKind = 'meta' | 'added' | 'deleted' | 'context'

export function presentChatToolDiff(diff: string) {
  let added = 0
  let deleted = 0
  const blocks: Array<{ kind: DiffLineKind, lines: string[] }> = []
  for (const text of diff.split('\n')) {
    let kind: DiffLineKind = 'context'
    if (/^(?:@@|diff |index |---(?:\s|$)|\+\+\+(?:\s|$))/.test(text)) {
      kind = 'meta'
    }
    else if (text.startsWith('+')) {
      added++
      kind = 'added'
    }
    else if (text.startsWith('-')) {
      deleted++
      kind = 'deleted'
    }
    const previous = blocks.at(-1)
    if (previous?.kind === kind)
      previous.lines.push(text)
    else
      blocks.push({ kind, lines: [text] })
  }
  return { blocks: blocks.map(block => ({ kind: block.kind, text: block.lines.join('\n') })), added, deleted }
}
