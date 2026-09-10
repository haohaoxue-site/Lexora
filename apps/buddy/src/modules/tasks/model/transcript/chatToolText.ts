export function presentChatToolRead(output: string, lineStart: number, native: boolean) {
  if (native && (/^Read image file \[image\//.test(output) || /^\[Line \d+ is .+, exceeds .+ limit\. Use bash:/.test(output)))
    return { content: output, numbers: null, notice: null }
  const notice = native
    ? output.match(/\n\n(\[(?:Showing lines \d+-\d+ of \d+(?: \([^\n]+ limit\))?\. Use offset=\d+ to continue\.|\d+ more lines in file\. Use offset=\d+ to continue\.)\])$/)
    : null
  const content = notice ? output.slice(0, notice.index) : output
  const count = content.split('\n').length
  return {
    content,
    numbers: Array.from({ length: count }, (_, index) => String(lineStart + index)).join('\n'),
    notice: notice?.[1] ?? null,
  }
}

interface ChatSearchFile {
  kind: 'file'
  path: string
  lines: Array<{ number: string, text: string, match: boolean }>
}

interface ChatSearchText {
  kind: 'text'
  text: string
}

export function presentChatToolSearch(output: string, toolName: string, limit = 200) {
  const blocks: Array<ChatSearchFile | ChatSearchText> = []
  const lines = output.split('\n')
  for (const line of lines.slice(0, limit)) {
    const match = toolName === 'grep' ? line.match(/^(.+?)(:|-)([1-9]\d*)\2 (.*)$/) : null
    const previous = blocks.at(-1)
    if (match) {
      const row = { number: match[3]!, text: match[4]!, match: match[2] === ':' }
      if (previous?.kind === 'file' && previous.path === match[1])
        previous.lines.push(row)
      else
        blocks.push({ kind: 'file', path: match[1]!, lines: [row] })
    }
    else if (previous?.kind === 'text') {
      previous.text += `\n${line}`
    }
    else {
      blocks.push({ kind: 'text', text: line })
    }
  }
  return { blocks, remaining: Math.max(0, lines.length - limit) }
}
