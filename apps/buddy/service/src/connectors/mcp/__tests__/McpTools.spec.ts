import type { ToolDefinition } from '@earendil-works/pi-coding-agent'
import type { Tool } from '@modelcontextprotocol/client'
import { describe, expect, it } from 'vitest'
import { createMcpToolName, createMcpTools } from '../createMcpTools'
import { normalizeMcpResult } from '../mcpToolResults'

const tool: Tool = { name: 'lookup', inputSchema: { type: 'object', properties: {} } }
function create(annotations: Tool['annotations'], trusted = true) {
  return createMcpTools({
    serverId: 'stable-id',
    serverName: '日历',
    trusted,
    tools: [{ ...tool, annotations }],
    callTool: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
  })
}

describe('mCP adapter contracts', () => {
  it('keeps aliases bounded and distinguishes names normalized to the same slug', () => {
    const names = ['foo-bar', 'foo_bar', 'FOO_BAR', '中文', 'a'.repeat(300)].map(name => createMcpToolName('stable-id', name))
    expect(new Set(names).size).toBe(names.length)
    expect(names.every(name => /^\w{1,64}$/.test(name))).toBe(true)
    expect(createMcpToolName('one', 'foo')).not.toBe(createMcpToolName('two', 'foo'))
  })

  it('requires explicit closed-world read-only hints from a trusted server', () => {
    const classification = (annotations: Tool['annotations'], trusted = true) => [...create(annotations, trusted).classifications.values()][0]
    expect(classification({ readOnlyHint: true, openWorldHint: false })).toEqual({ access: 'read' })
    expect(classification({ readOnlyHint: true })).toMatchObject({ access: 'network' })
    expect(classification(undefined)).toMatchObject({ access: 'network', forceAsk: true })
    expect(classification({ readOnlyHint: true, openWorldHint: false }, false)).toMatchObject({ access: 'network', forceAsk: true })
  })

  it('preserves structured business fields, image blocks and resource URIs', async () => {
    const result = await normalizeMcpResult({
      content: [{ type: 'text', text: 'token_count=18' }, { type: 'resource_link', name: 'Report', uri: 'mcp://reports/1' }, { type: 'image', mimeType: 'image/png', data: 'aGVsbG8=' }],
      structuredContent: { token_count: 18, secret_recipe: 'business data' },
      isError: true,
    })
    expect(result.isError).toBe(true)
    expect(result.content[0]).toMatchObject({ type: 'text', text: expect.stringContaining('mcp://reports/1') })
    expect(JSON.stringify(result.content)).toContain('secret_recipe')
    expect(result.content[1]).toEqual({ type: 'image', mimeType: 'image/png', data: 'aGVsbG8=' })
  })

  it('saves complete long text and audio instead of silently dropping data', async () => {
    const saved: Array<{ bytes: Uint8Array, mime: string }> = []
    const text = '长文本'.repeat(30000)
    const result = await normalizeMcpResult({ content: [{ type: 'text', text }, { type: 'audio', mimeType: 'audio/wav', data: 'aGVsbG8=' }] }, async (bytes, mime) => {
      saved.push({ bytes, mime })
      return { artifactId: String(saved.length), path: `/fixture/${saved.length}` }
    })
    expect(result.artifactIds).toEqual(['1', '2'])
    expect(saved[0]?.mime).toBe('audio/wav')
    expect(new TextDecoder().decode(saved[1]?.bytes)).toContain(text)
    expect(JSON.stringify(result.content).length).toBeLessThan(64000)
  })

  it('does not hide cancellation as a tool failure', async () => {
    const controller = new AbortController()
    const reason = new Error('cancelled')
    const result = createMcpTools({ serverId: 'one', serverName: 'One', tools: [tool], trusted: false, callTool: async () => {
      controller.abort(reason)
      throw reason
    } })
    await expect(execute(result.tools[0]!, controller.signal)).rejects.toBe(reason)
  })

  it('does not materialize files for read-only conversations', async () => {
    await expect(normalizeMcpResult({ content: [{ type: 'audio', data: 'aGVsbG8=', mimeType: 'audio/wav' }] })).rejects.toMatchObject({ code: 'MCP_RESULT_STORAGE_DENIED' })
  })
})

function execute(tool: ToolDefinition, signal: AbortSignal) {
  return tool.execute('call-1', {}, signal, undefined, {} as never)
}
