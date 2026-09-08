import { describe, expect, it } from 'vitest'

import {
  createApprovalReviewPayload,
} from '../../../../shared/permissions/approvalReviewPayload'

describe('createApprovalReviewPayload', () => {
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

  it('keeps only argument names for opaque tools and typed path targets for grants', () => {
    expect(createApprovalReviewPayload({
      allowForTurn: true,
      arguments: { apiKey: 'secret-value', body: 'private-content', url: 'https://example.com' },
      kind: 'network',
      toolName: 'fetch_remote',
    })).toEqual({
      allowForTurn: true,
      argumentNames: ['apiKey', 'body', 'url'],
      card: 'arguments',
      toolName: 'fetch_remote',
    })
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
