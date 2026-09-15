import type { ChatPromptContextOption } from '@/modules/prompt-input'
import { describe, expect, it } from 'vitest'
import { translateBuddy } from '@/i18n/buddyMessages'
import { describeChatComposerSource, getChatComposerSourceRoot } from '../chatComposerSourcePresentation'

const file: ChatPromptContextOption = {
  category: 'space',
  description: null,
  entryKind: 'file',
  kind: 'file',
  label: 'notes.txt',
  path: '/work/src/notes.txt',
  fileMetadata: { mimeType: 'text/plain', sizeBytes: 1024 },
  source: { bindingId: 'binding', relativePath: 'src/notes.txt', spaceId: 'space' },
  value: 'notes',
}
const t = (key: Parameters<typeof translateBuddy>[1]) => translateBuddy('zh-CN', key)

describe('composer source presentation', () => {
  it.each([
    ['/work/src/notes.txt', 'src/notes.txt', '/work'],
    ['/notes.txt', 'notes.txt', '/'],
    ['C:\\work\\src\\notes.txt', 'src/notes.txt', 'C:\\work'],
    ['C:\\notes.txt', 'notes.txt', 'C:\\'],
    ['\\\\server\\share\\notes.txt', 'notes.txt', '\\\\server\\share'],
  ])('separates the root from %s without duplicating the filename', (path, relativePath, root) => {
    const option = { ...file, path, source: { bindingId: 'binding', relativePath, spaceId: 'space' } }
    expect(getChatComposerSourceRoot(option)).toBe(root)
    expect(describeChatComposerSource(option, 'zh-CN', t, root)).toBe(relativePath.includes('/') ? 'src · 1 KB' : '1 KB')
  })

  it('keeps different roots distinguishable and describes directories without recursive sizes', () => {
    expect(describeChatComposerSource(file, 'zh-CN', t, null)).toBe('/work/src · 1 KB')
    const folder = { ...file, label: 'src', path: '/work/src', entryKind: 'directory' as const, source: { bindingId: 'binding', relativePath: 'src', spaceId: 'space' } }
    expect(describeChatComposerSource(folder, 'zh-CN', t, '/work')).toBe('目录')
  })

  it('describes clipboard images from metadata without exposing storage paths', () => {
    const clipboard = { ...file, category: 'current' as const, label: '[Image #1]', path: null, fileMetadata: { mimeType: 'image/png', sizeBytes: 77, nameSource: 'clipboard' as const } }
    expect(describeChatComposerSource(clipboard, 'zh-CN', t, null)).toBe('剪贴板 · PNG · 77 B')
  })

  it('localizes historical timestamps and keeps skill descriptions unchanged', () => {
    const createdAt = '2026-09-15T10:00:00.000Z'
    const history = { ...file, category: 'history' as const, path: null, fileMetadata: { ...file.fileMetadata!, createdAt } }
    const date = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(createdAt))
    expect(describeChatComposerSource(history, 'zh-CN', t, null)).toBe(`${date} · 1 KB`)
    expect(describeChatComposerSource({ ...file, kind: 'skill', description: 'A useful skill' }, 'zh-CN', t, null)).toBe('A useful skill')
  })
})
