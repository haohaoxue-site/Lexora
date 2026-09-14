import { describe, expect, it } from 'vitest'

import {
  approvalReviewPayloadSchema,
  createApprovalReviewPayload,
} from '../../../../shared/permissions/approvalReviewPayload'

describe('createApprovalReviewPayload', () => {
  it('persists shell reasons without breaking historical payloads or command redaction', () => {
    const context = { cwd: '/workspace', reason: 'unknown-command' as const }
    const payload = createApprovalReviewPayload({
      allowForTurn: true,
      arguments: { command: 'deploy --token test-secret' },
      kind: 'shell',
      shell: context,
      toolName: 'bash',
    })
    expect(approvalReviewPayloadSchema.parse(JSON.parse(JSON.stringify(payload)))).toEqual({
      allowForTurn: true,
      card: 'shell',
      command: 'deploy --token=[redacted]',
      context,
      toolName: 'bash',
    })
    expect(approvalReviewPayloadSchema.parse({ card: 'shell', command: 'git status', toolName: 'bash' })).toEqual({
      allowForTurn: true,
      card: 'shell',
      command: 'git status',
      toolName: 'bash',
    })
    expect(approvalReviewPayloadSchema.safeParse({ ...payload, context: { ...context, reason: 'invented-risk' } }).success).toBe(false)
  })
  it('keeps ordinary shell commands reviewable and redacts credential forms', () => {
    expect(createApprovalReviewPayload({
      allowForTurn: true,
      arguments: { command: 'pnpm test' },
      kind: 'shell',
      toolName: 'bash',
    })).toEqual({ allowForTurn: true, card: 'shell', command: 'pnpm test', toolName: 'bash' })

    const payload = createApprovalReviewPayload({
      allowForTurn: true,
      arguments: {
        command: [
          'API_KEY=assignment-secret',
          'deploy --token flag-secret',
          '--password=inline-secret',
          '--header "Authorization: Bearer bearer-secret"',
          'https://alice:url-secret@example.com/path',
        ].join(' '),
      },
      kind: 'shell',
      toolName: 'bash',
    })
    const serialized = JSON.stringify(payload)

    expect(payload).toMatchObject({ command: expect.stringContaining('[redacted]') })
    for (const secret of [
      'assignment-secret',
      'flag-secret',
      'inline-secret',
      'bearer-secret',
      'url-secret',
    ]) {
      expect(serialized).not.toContain(secret)
    }
  })

  it('keeps web search and fetch targets reviewable without exposing opaque arguments', () => {
    expect(createApprovalReviewPayload({
      allowForTurn: true,
      arguments: { provider: 'google', query: 'Electron documentation' },
      kind: 'network',
      toolName: 'lexora_web_search',
    })).toEqual({
      allowForTurn: true,
      card: 'web',
      operation: 'search',
      provider: 'google',
      target: 'Electron documentation',
      toolName: 'lexora_web_search',
    })
    expect(createApprovalReviewPayload({
      allowForTurn: true,
      arguments: { provider: 'tavily', url: 'https://example.com/docs' },
      kind: 'network',
      toolName: 'lexora_web_fetch',
    })).toEqual({
      allowForTurn: true,
      card: 'web',
      operation: 'fetch',
      provider: 'tavily',
      target: 'https://example.com/docs',
      toolName: 'lexora_web_fetch',
    })
  })

  it('presents a structured network URL instead of raw argument names', () => {
    expect(createApprovalReviewPayload({
      allowForTurn: true,
      arguments: {
        kind: 'url',
        until: { event: 'load' },
        url: 'https://example.com/docs#section',
      },
      kind: 'network',
      toolName: 'fetch_remote',
    })).toEqual({
      allowForTurn: true,
      card: 'network-target',
      target: 'https://example.com/docs',
      toolName: 'fetch_remote',
    })
  })

  it('keeps reviewable argument values while redacting credential fields', () => {
    const payload = createApprovalReviewPayload({
      allowForTurn: true,
      arguments: {
        address: '西湖区龙井路 1 号',
        apiKey: 'top-level-secret',
        city: '杭州市',
        headers: {
          Authorization: 'Bearer nested-secret',
          Accept: 'application/json',
        },
        options: { limit: 3 },
      },
      kind: 'mcp',
      toolName: 'mcp__maps__maps_geo',
    })

    expect(payload).toMatchObject({
      argumentNames: ['address', 'apiKey', 'city', 'headers', 'options'],
      card: 'arguments',
      parameters: [
        { name: 'address', value: '西湖区龙井路 1 号' },
        { name: 'apiKey', value: '[redacted]' },
        { name: 'city', value: '杭州市' },
        { name: 'headers', value: '{\n  "Authorization": "[redacted]",\n  "Accept": "application/json"\n}' },
        { name: 'options', value: '{\n  "limit": 3\n}' },
      ],
    })
    expect(JSON.stringify(payload)).not.toContain('top-level-secret')
    expect(JSON.stringify(payload)).not.toContain('nested-secret')
  })

  it('keeps typed path targets for grants', () => {
    expect(createApprovalReviewPayload({
      allowForTurn: true,
      arguments: {
        apiKey: 'secret-value',
        path: '/space/one.md',
        paths: ['/space/two.md', 42],
      },
      paths: {
        access: 'write',
        grant: { owner: 'conversation', root: '/space' },
        targets: [
          { path: '/space/one.md', zone: 'outside' },
          { path: '/space/two.md', zone: 'outside' },
        ],
      },
      kind: 'write',
      toolName: 'write_files',
    })).toEqual({
      access: 'write',
      allowForTurn: true,
      card: 'paths',
      grant: { owner: 'conversation', root: '/space' },
      targets: [
        { path: '/space/one.md', zone: 'outside' },
        { path: '/space/two.md', zone: 'outside' },
      ],
      toolName: 'write_files',
    })
    expect(createApprovalReviewPayload({
      allowForTurn: true,
      arguments: { path: '/space/index.html' },
      kind: 'render',
      paths: {
        access: 'render',
        grant: { owner: 'space', root: '/space' },
        targets: [{ path: '/space/index.html', zone: 'outside' }],
      },
      toolName: 'lexora_browser_open',
    })).toMatchObject({ access: 'render', card: 'paths' })
  })

  it('keeps only a typed, bounded system action target in the approval review', () => {
    expect(createApprovalReviewPayload({
      allowForTurn: true,
      arguments: {
        action: 'terminate-process',
        reason: 'Restart the unresponsive proxy client',
        target: {
          kind: 'process',
          name: 'fixture-client',
        },
      },
      kind: 'system',
      systemAction: {
        action: 'terminate-process',
        effect: 'Ask the process to exit gracefully',
        expiresAt: '2026-08-23T12:05:00.000Z',
        interruption: 'network',
        reason: 'Restart the unresponsive proxy client',
        target: {
          displayName: 'Fixture Client',
          pid: 4123031,
          startedAt: '2026-08-23T10:00:00.000Z',
        },
      },
      toolName: 'lexora_system_action',
    })).toEqual({
      action: 'terminate-process',
      allowForTurn: true,
      card: 'system-action',
      effect: 'Ask the process to exit gracefully',
      expiresAt: '2026-08-23T12:05:00.000Z',
      interruption: 'network',
      reason: 'Restart the unresponsive proxy client',
      target: {
        displayName: 'Fixture Client',
        pid: 4123031,
        startedAt: '2026-08-23T10:00:00.000Z',
      },
      toolName: 'lexora_system_action',
    })
  })
})
