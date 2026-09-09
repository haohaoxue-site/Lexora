import type { LocalMessage } from '@buddy-shared/conversation/conversationApi'

import { describe, expect, it } from 'vitest'

import {
  getChatMessageDisplayText,
  getChatMessageInterruption,
  getChatMessageText,
  getChatMessageUserContent,
  isVisibleChatMessage,
} from '../chatMessageContent'

describe('chatMessageContent', () => {
  it('keeps quote-only messages visible without turning the quote into body text', () => {
    const quoted = message('user', { resourceSnapshots: [], userContent: {
      body: [{ type: 'paragraph', content: [] }],
      panelResourceIds: [],
      version: 1,
      quotes: [{ id: 'quote-1', text: '    enabled: true', source: { conversationId: 'conversation-1', branchId: 'branch-1', messageId: 'message-1', role: 'assistant', runId: 'run-1' } }],
    } })
    expect(isVisibleChatMessage(quoted)).toBe(true)
    expect(getChatMessageText(quoted)).toBe('')
    expect(getChatMessageUserContent(quoted)?.userContent.quotes).toHaveLength(1)
  })

  it('keeps text messages and removes tool or empty persisted bubbles', () => {
    const messages = [
      message('user', { text: 'Question' }),
      message('assistant', 'Answer'),
      message('assistant', { text: '   ' }),
      message('tool', { text: 'internal result' }),
    ]

    expect(messages.filter(isVisibleChatMessage).map(getChatMessageText)).toEqual([
      'Question',
      'Answer',
    ])
  })

  it('keeps a user message that contains only persisted attachments', () => {
    const attachmentOnly = message('user', { attachmentIds: ['attachment-1'], text: '' }, [{
      attachmentId: 'attachment-1',
      kind: 'image',
      mimeType: 'image/png',
      name: 'reference.png',
      previewUrl: null,
      sizeBytes: 2048,
    }])

    expect(isVisibleChatMessage(attachmentOnly)).toBe(true)
  })

  it('rejects a structured message whose resource snapshot does not cover its content', () => {
    const messageWithMissingSnapshot = message('user', {
      resourceSnapshots: [],
      userContent: {
        body: [{
          content: [{ resourceId: 'resource-1', type: 'resource_ref' }],
          type: 'paragraph',
        }],
        panelResourceIds: [],
        version: 1,
      },
    })

    expect(getChatMessageUserContent(messageWithMissingSnapshot)).toBeNull()
  })

  it('recognizes only strict interrupted assistant message content', () => {
    expect(getChatMessageInterruption(message('assistant', {
      state: 'interrupted',
      text: 'Recovered partial answer',
      truncated: true,
    }))).toEqual({ truncated: true })
    expect(getChatMessageInterruption(message('assistant', {
      extra: 'untrusted',
      state: 'interrupted',
      text: 'Not a strict contract',
      truncated: false,
    }))).toBeNull()
    expect(getChatMessageInterruption(message('user', {
      state: 'interrupted',
      text: 'User content cannot be interrupted assistant output',
      truncated: false,
    }))).toBeNull()
  })

  it('removes a redundant artifact download line and neutralizes unsupported artifact links', () => {
    const assistant = message('assistant', {
      text: [
        '页面已完成。',
        '',
        '[下载 hello-world.html](artifact:artifact-1)',
        '',
        '也可以查看[另一个文件](artifact:unknown-artifact)。',
      ].join('\n'),
    })

    expect(getChatMessageDisplayText(assistant, ['artifact-1'])).toBe([
      '页面已完成。',
      '',
      '也可以查看另一个文件。',
    ].join('\n'))
    expect(getChatMessageDisplayText(
      message('assistant', '[无效链接](artifact:unknown-artifact)'),
    )).toBe('无效链接')

    const presentedArtifact = {
      artifactId: 'artifact-1',
      name: 'hello-world.html',
      path: '/workspace/site/hello-world.html',
    }
    expect(getChatMessageDisplayText(
      message('assistant', '[下载 hello-world.html](site/hello-world.html)'),
      [presentedArtifact],
    )).toBe('')
    expect(getChatMessageDisplayText(
      message('assistant', '[官网下载](https://example.com/hello-world.html)'),
      [presentedArtifact],
    )).toBe('[官网下载](https://example.com/hello-world.html)')
  })
})

function message(
  role: LocalMessage['role'],
  content: LocalMessage['content'],
  attachments: ReadonlyArray<{
    attachmentId: string
    kind: 'binary' | 'image' | 'text'
    mimeType: string
    name: string
    previewUrl: string | null
    sizeBytes: number
  }> = [],
): LocalMessage {
  return {
    attachments,
    branchId: 'branch-1',
    content,
    conversationId: 'conversation-1',
    createdAt: '2026-08-14T00:00:00.000Z',
    id: `${role}-${JSON.stringify(content)}`,
    role,
    runId: null,
  } as LocalMessage
}
