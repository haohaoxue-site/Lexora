import type { LocalSkill, LocalSkillCatalog, SkillDetail } from '@buddy-shared/skills/skillApi'
import type { SkillsContext } from '../../skillsContext'
import { deferred } from '@buddy-tests/deferred'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, shallowRef } from 'vue'
import { useSkillsManager } from '../useSkillsManager'

const scopes: Array<ReturnType<typeof effectScope>> = []
afterEach(() => {
  for (const scope of scopes.splice(0))
    scope.stop()
})

function catalog(revision: string): LocalSkillCatalog {
  return { revision, skills: [], diagnostics: [] }
}

function fixture() {
  const api = {
    list: vi.fn<SkillsContext['api']['list']>().mockResolvedValue(catalog('initial')),
    setEnabled: vi.fn<SkillsContext['api']['setEnabled']>().mockResolvedValue(catalog('updated')),
    onChanged: () => () => {},
    discard: async () => {},
  } as unknown as SkillsContext['api']
  const scope = shallowRef<string | null>(null)
  const owner = effectScope()
  scopes.push(owner)
  const manager = owner.run(() => useSkillsManager({ api, ready: Promise.resolve(), language: shallowRef('zh-CN'), spaces: shallowRef([]), writeClipboardText: async () => {} }, scope))!
  return { api, scope, owner, manager }
}

describe('skill management request ownership', () => {
  it('opens details immediately and keeps them closed after a late response', async () => {
    const f = fixture()
    await vi.waitFor(() => expect(f.manager.catalog.value?.revision).toBe('initial'))
    const skill = { id: 'writer', name: 'writer' } as LocalSkill
    const pending = deferred<SkillDetail>()
    f.api.get = () => pending.promise
    const request = f.manager.inspect(skill)
    expect(f.manager.selectedSkill.value).toBe(skill)
    expect(f.manager.detailLoading.value).toBe(true)
    f.manager.closeDetail()
    pending.resolve({ skill, content: '', body: 'Late content', metadata: [], compatibility: null })
    await request
    expect(f.manager.selectedSkill.value).toBeNull()
    expect(f.manager.detail.value).toBeNull()
    expect(f.manager.detailLoading.value).toBe(false)
  })

  it('shows a detail failure in the open drawer and ignores an older selection', async () => {
    const f = fixture()
    await vi.waitFor(() => expect(f.manager.catalog.value?.revision).toBe('initial'))
    const first = deferred<SkillDetail>()
    const second = deferred<SkillDetail>()
    f.api.get = input => input.id === 'one' ? first.promise : second.promise
    const old = f.manager.inspect({ id: 'one', name: 'one' } as LocalSkill)
    const current = f.manager.inspect({ id: 'two', name: 'two' } as LocalSkill)
    second.reject(new Error('SKILL_NOT_FOUND'))
    await current
    first.resolve({ skill: { id: 'one' } as LocalSkill, content: '', body: 'Old', metadata: [], compatibility: null })
    await old
    expect(f.manager.selectedSkill.value?.id).toBe('two')
    expect(f.manager.detail.value).toBeNull()
    expect(f.manager.detailError.value).toBeTruthy()
    expect(f.manager.error.value).toBeNull()
  })

  it('keeps a new scope intact when an old scope fails later', async () => {
    const f = fixture()
    await vi.waitFor(() => expect(f.manager.catalog.value?.revision).toBe('initial'))
    const pending = deferred<LocalSkillCatalog>()
    vi.mocked(f.api.list).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(catalog('space'))
    const oldLoad = f.manager.load()
    await Promise.resolve()
    f.scope.value = 'space-a'
    await vi.waitFor(() => expect(f.manager.catalog.value?.revision).toBe('space'))
    pending.reject(new Error('old scope unavailable'))
    await oldLoad
    expect(f.manager.catalog.value?.revision).toBe('space')
    expect(f.manager.error.value).toBeNull()
  })

  it('does not overwrite a completed mutation with an earlier list response', async () => {
    const f = fixture()
    await vi.waitFor(() => expect(f.manager.catalog.value?.revision).toBe('initial'))
    const pending = deferred<LocalSkillCatalog>()
    vi.mocked(f.api.list).mockReturnValueOnce(pending.promise)
    const load = f.manager.load()
    await Promise.resolve()
    await f.manager.setEnabled({ id: 'writer', revision: 'one' } as never, false)
    pending.resolve(catalog('old'))
    await load
    expect(f.manager.catalog.value?.revision).toBe('updated')
    expect(f.manager.loading.value).toBe(false)
  })

  it('discards a late installation preview after leaving its scope', async () => {
    const f = fixture()
    const pending = deferred<Awaited<ReturnType<SkillsContext['api']['previewLocal']>>>()
    const discarded: string[] = []
    f.api.previewLocal = () => pending.promise
    f.api.discard = async (id) => {
      discarded.push(id)
    }
    const request = f.manager.startPreview('directory')
    f.scope.value = 'space-a'
    pending.resolve({ id: 'preview-one', candidates: [] } as never)
    await request
    expect(f.manager.preview.value).toBeNull()
    expect(discarded).toEqual(['preview-one'])
  })
})
