export function conversationTreePreview(text: string, streaming = false): string {
  const limit = streaming ? 640 : 240
  const source = streaming ? text.slice(-4096) : text.slice(0, 4096)
  const plain = source
    .replace(/```[^\n]*\n?/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-*+]\s+)/gm, '')
    .replace(/[*_`~]+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (streaming)
    return plain.length > limit ? `…${plain.slice(-(limit - 1))}` : plain
  return plain.length > limit || text.length > source.length ? `${plain.slice(0, limit - 1)}…` : plain
}
