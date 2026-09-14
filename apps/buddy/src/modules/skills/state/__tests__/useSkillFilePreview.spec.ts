import type { LocalChatApi } from '@buddy-electron/shared/localChatApi'
import type { DirectoryPage, FilePreview } from '@buddy-shared/files/filePreview'
import type { LocalSkill } from '@buddy-shared/skills/skillApi'
import { deferred } from '@buddy-tests/deferred'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, shallowRef } from 'vue'
import { useSkillFilePreview } from '../useSkillFilePreview'

const owners: Array<ReturnType<typeof effectScope>> = []
afterEach(() => owners.splice(0).forEach(owner => owner.stop()))

function text(value: string): FilePreview {
  return { kind: 'text', text: value, imageUrl: null, sizeBytes: value.length }
}

function fixture(api: Partial<LocalChatApi['skills']>) {
  const target = shallowRef<{ spaceId: string | null, skill: LocalSkill } | null>({ spaceId: 'space-one', skill: { id: 'one', filePath: '/one/SKILL.md' } as LocalSkill })
  const owner = effectScope()
  owners.push(owner)
  const view = owner.run(() => useSkillFilePreview(api as LocalChatApi['skills'], target))!
  return { target, owner, view }
}

describe('skill file preview ownership', () => {
  it('keeps the most recently selected file when an earlier read finishes late', async () => {
    const pending = deferred<FilePreview>()
    const f = fixture({ listFiles: async () => ({ entries: [], nextCursor: null }), readFile: async input => input.path === 'first.md' ? pending.promise : text(input.path) })
    await vi.waitFor(() => expect(f.view.preview.value?.text).toBe('SKILL.md'))
    const first = f.view.open('first.md')
    await f.view.open('second.md')
    pending.resolve(text('Old file'))
    await first
    expect(f.view.path.value).toBe('second.md')
    expect(f.view.preview.value?.text).toBe('second.md')
    expect(f.view.loading.value).toBe(false)
  })

  it('discards directory pages and errors after switching the skill', async () => {
    const directory = deferred<DirectoryPage>()
    const content = deferred<FilePreview>()
    const f = fixture({
      listFiles: async input => input.id === 'one' ? directory.promise : { entries: [{ name: 'current.md', path: 'current.md', kind: 'file', unavailable: false }], nextCursor: null },
      readFile: async input => input.id === 'one' ? content.promise : text('Current skill'),
    })
    f.target.value = { spaceId: 'space-two', skill: { id: 'two', filePath: '/two/SKILL.md' } as LocalSkill }
    await vi.waitFor(() => expect(f.view.preview.value?.text).toBe('Current skill'))
    directory.resolve({ entries: [{ name: 'stale.md', path: 'stale.md', kind: 'file', unavailable: false }], nextCursor: null })
    content.reject(new Error('Old read failed'))
    await Promise.resolve()
    await Promise.resolve()
    expect(f.view.nodes.value.map(node => node.key)).toEqual(['current.md'])
    expect(f.view.failed.value).toBe(false)
    expect(f.view.treeFailed.value).toBe(false)
    f.target.value = null
    expect(f.view.preview.value).toBeNull()
    expect(f.view.nodes.value).toEqual([])
  })
})
