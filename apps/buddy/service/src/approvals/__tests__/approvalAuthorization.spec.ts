import type { ApprovalRequest } from '../ApprovalService'
import { describe, expect, it } from 'vitest'
import { approvalReuseScopes, createApprovalAuthorizationKeys } from '../approvalAuthorization'

const request: ApprovalRequest = {
  arguments: {},
  kind: 'network',
  cwd: '/workspace',
  runId: 'fixture-run',
  signal: new AbortController().signal,
  summary: 'Fixture',
  toolCallId: 'fixture-call',
  toolName: 'bash',
}

const keys = (input: Partial<ApprovalRequest>) => createApprovalAuthorizationKeys({ ...request, ...input })

describe('approval authorization identity', () => {
  it('normalizes network destinations but separates commands, hosts and ports', () => {
    const first = keys({ arguments: { command: 'pnpm test' }, network: { host: 'REGISTRY.EXAMPLE.COM.', port: 443 } })
    expect(keys({ arguments: { command: 'pnpm test' }, network: { host: 'registry.example.com', port: 443 } })).toEqual(first)
    const another = keys({ arguments: { command: 'pnpm build' }, network: { host: 'registry.example.com', port: 443 } })
    expect(another.source).toBe(first.source)
    expect(another.operation).not.toBe(first.operation)
    for (const network of [{ host: 'other.example.com', port: 443 }, { host: 'registry.example.com', port: 8443 }])
      expect(keys({ network }).source).not.toBe(first.source)
  })

  it('bounds shell source authorization to its tool, execution boundary and working directory', () => {
    const first = keys({ kind: 'shell', arguments: { command: 'node a.mjs' } })
    expect(keys({ kind: 'shell', arguments: { command: 'node b.mjs' } }).source).toBe(first.source)
    expect(keys({ kind: 'shell', cwd: '/other' }).source).not.toBe(first.source)
    expect(keys({ kind: 'shell', toolName: 'lexora_host_shell' }).source).not.toBe(first.source)
    expect(keys({ kind: 'shell', shell: { cwd: '/workspace', boundary: 'sandbox', reason: 'manual-policy' } }).source).not.toBe(first.source)
  })

  it('bounds web authorization by origin and search provider', () => {
    const web = (url: string) => keys({ toolName: 'lexora_web_fetch', arguments: { url } })
    expect(web('https://example.com/a#one')).toEqual(web('https://example.com/a#two'))
    expect(web('https://example.com/a').source).toBe(web('https://example.com/b').source)
    expect(web('https://example.com/a').operation).not.toBe(web('https://example.com/b').operation)
    expect(web('https://example.com').source).not.toBe(web('http://example.com').source)
    expect(keys({ toolName: 'lexora_web_search', arguments: { provider: 'alpha', query: 'fixture' } }).source)
      .not
      .toBe(keys({ toolName: 'lexora_web_search', arguments: { provider: 'beta', query: 'fixture' } }).source)
  })

  it('does not turn sensitive or unknown targets into source grants', () => {
    const sensitive = keys({ kind: 'read', paths: { access: 'read', grant: null, targets: [{ path: '/outside/.env', zone: 'sensitive' }] } })
    expect(approvalReuseScopes(sensitive)).toEqual(['operation', 'turn'])
    const unknown = keys({ kind: 'system', toolName: 'future_plugin', arguments: { action: 'a' } })
    expect(approvalReuseScopes(unknown)).toEqual(['operation', 'turn'])
    expect(unknown.operation).not.toBe(keys({ kind: 'system', toolName: 'future_plugin', arguments: { action: 'b' } }).operation)
    const directory = (access: 'read' | 'write') => keys({ sandboxDirectory: { path: '/outside', access, reason: 'fixture' } })
    expect(directory('read').operation).not.toBe(directory('write').operation)
    expect(approvalReuseScopes(directory('read'))).toEqual(['operation', 'turn'])
  })

  it('invalidates MCP identities when the connector generation changes', () => {
    const mcp = (generation: number, tool: string) => keys({ kind: 'mcp', reuse: { operation: ['connector', generation, tool], source: ['connector', generation] } })
    expect(mcp(1, 'search').source).toBe(mcp(1, 'fetch').source)
    expect(mcp(1, 'search').operation).not.toBe(mcp(1, 'fetch').operation)
    expect(mcp(1, 'search').source).not.toBe(mcp(2, 'search').source)
  })
})
