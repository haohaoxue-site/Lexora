import type { ImageContent, TextContent } from '@earendil-works/pi-ai'
import type { CallToolResult } from '@modelcontextprotocol/client'
import { Buffer } from 'node:buffer'
import { McpClientError } from './mcpErrors'

export type McpResultWriter = (bytes: Uint8Array, mimeType: string, signal?: AbortSignal) => Promise<{ artifactId: string, path: string }>

const MAX_RESULT_BYTES = 32 * 1024 * 1024
const MAX_INLINE_TEXT = 64 * 1024
const MAX_INLINE_IMAGE = 4 * 1024 * 1024

export async function normalizeMcpResult(result: CallToolResult, write?: McpResultWriter, signal?: AbortSignal, includeImages = true) {
  if (Buffer.byteLength(JSON.stringify(result)) > MAX_RESULT_BYTES || (result.content?.length ?? 0) > 128)
    throw new McpClientError('MCP_RESULT_TOO_LARGE')
  const content: Array<TextContent | ImageContent> = []
  const artifactIds: string[] = []
  const text: string[] = []
  let imageBytes = 0
  const save = async (bytes: Uint8Array, mimeType: string) => {
    if (!write)
      throw new McpClientError('MCP_RESULT_STORAGE_DENIED')
    signal?.throwIfAborted()
    const saved = await write(bytes, mimeType, signal)
    artifactIds.push(saved.artifactId)
    return saved
  }
  for (const block of result.content ?? []) {
    signal?.throwIfAborted()
    if (block.type === 'text') {
      text.push(block.text)
    }
    else if (block.type === 'resource_link') {
      text.push(JSON.stringify({ type: block.type, name: block.name, uri: block.uri, mimeType: block.mimeType, description: block.description }))
    }
    else if (block.type === 'resource') {
      const resource = block.resource
      text.push(`Resource: ${resource.uri}`)
      if ('text' in resource) {
        text.push(resource.text)
      }
      else {
        const saved = await save(Buffer.from(resource.blob, 'base64'), resource.mimeType ?? 'application/octet-stream')
        text.push(JSON.stringify(saved))
      }
    }
    else if (block.type === 'image' || block.type === 'audio') {
      const bytes = Buffer.from(block.data, 'base64')
      if (write)
        text.push(JSON.stringify(await save(bytes, block.mimeType)))
      if (includeImages && block.type === 'image' && /^image\/(?:png|jpeg|webp|gif)$/.test(block.mimeType) && imageBytes + bytes.length <= MAX_INLINE_IMAGE) {
        imageBytes += bytes.length
        content.push({ type: 'image', data: block.data, mimeType: block.mimeType })
      }
      else if (!write) {
        throw new McpClientError('MCP_RESULT_STORAGE_DENIED')
      }
    }
  }
  if (result.structuredContent !== undefined)
    text.push(JSON.stringify({ structuredContent: result.structuredContent }))
  const joined = text.filter(Boolean).join('\n') || 'MCP tool completed without text output'
  if (Buffer.byteLength(joined) > MAX_INLINE_TEXT) {
    const saved = await save(Buffer.from(joined), 'text/plain')
    content.unshift({ type: 'text', text: `${Buffer.from(joined).subarray(0, MAX_INLINE_TEXT / 2).toString()}\n[Preview; complete result: ${JSON.stringify(saved)}]` })
  }
  else {
    content.unshift({ type: 'text', text: joined })
  }
  return { content, artifactIds, isError: result.isError === true }
}
