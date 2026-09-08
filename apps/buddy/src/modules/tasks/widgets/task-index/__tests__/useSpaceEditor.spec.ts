import type { LocalSpace } from '@buddy-shared/spaces/spaceApi'
import type { TaskSpaceInput } from '../../../state/task-index/typing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, shallowRef } from 'vue'
import { deferred } from '../../../../../../__tests__/deferred'
import { useSpaceEditor } from '../useSpaceEditor'

const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()))
function space(id: string): LocalSpace {
  return { id, name: id, activeRunCount: 0, additionalDirectories: [], createdAt: '2026-09-08T00:00:00.000Z', memoryScope: 'space_only', primaryDirectory: null, revokedAt: null, updatedAt: '2026-09-08T00:00:00.000Z' }
}
function fixture() {
  const scope = effectScope()
  scopes.push(scope)
  const show = shallowRef(true)
  const target = shallowRef<LocalSpace | null>(space('first'))
  const save = vi.fn<(input: TaskSpaceInput) => Promise<boolean>>().mockResolvedValue(true)
  const selectDirectory = vi.fn<() => Promise<string | null>>().mockResolvedValue(null)
  const editor = scope.run(() => useSpaceEditor({ show: () => show.value, space: () => target.value, selectDirectory, save, onSaved: () => {
    show.value = false
  } }))!
  return { editor, save, scope, selectDirectory, show, target }
}

describe('space editing session', () => {
  it('preserves local input across a refresh of the same Space', () => {
    const f = fixture()
    f.editor.form.name = 'unsaved'
    f.target.value = { ...space('first'), name: 'server updated' }
    expect(f.editor.form.name).toBe('unsaved')
    f.target.value = space('second')
    expect(f.editor.form.name).toBe('second')
    f.editor.form.name = 'second draft'
    f.show.value = false
    f.show.value = true
    expect(f.editor.form.name).toBe('second')
  })

  it.each(['reopen', 'replace', 'dispose'] as const)('rejects a directory result after %s', async (change) => {
    const f = fixture()
    const selected = deferred<string | null>()
    f.selectDirectory.mockReturnValueOnce(selected.promise)
    const selecting = f.editor.selectPrimaryDirectory()
    expect(f.editor.selectingDirectory.value).toBe(true)
    if (change === 'reopen') {
      f.show.value = false
      f.show.value = true
    }
    else if (change === 'replace') {
      f.target.value = space('second')
    }
    else {
      f.scope.stop()
    }
    selected.resolve('/workspace/old')
    await selecting
    expect(f.editor.form.primaryDirectory).toBeNull()
  })

  it('retains input on save failure and closes only after a successful retry', async () => {
    const f = fixture()
    const result = deferred<boolean>()
    f.save.mockReturnValueOnce(result.promise)
    f.editor.form.name = 'local'
    const saving = f.editor.save()
    await f.editor.save()
    expect(f.show.value).toBe(true)
    expect(f.editor.canSave.value).toBe(false)
    expect(f.save.mock.calls.map(([input]) => input.name)).toEqual(['local'])
    result.resolve(false)
    await saving
    expect(f.show.value).toBe(true)
    expect(f.editor.form.name).toBe('local')
    expect(f.editor.failed.value).toBe(true)
    await f.editor.save()
    expect(f.show.value).toBe(false)
  })

  it('does not close a new editing session when an old save succeeds', async () => {
    const f = fixture()
    const result = deferred<boolean>()
    f.save.mockReturnValueOnce(result.promise)
    const saving = f.editor.save()
    f.show.value = false
    f.show.value = true
    f.editor.form.name = 'new session'
    result.resolve(true)
    await saving
    expect(f.show.value).toBe(true)
    expect(f.editor.form.name).toBe('new session')
    expect(f.editor.saving.value).toBe(false)
  })

  it('submits a detached value and retains edits made after submission', async () => {
    const f = fixture()
    const result = deferred<boolean>()
    f.save.mockReturnValueOnce(result.promise)
    f.editor.form.primaryDirectory = { id: null, root: '/workspace/first' }
    const saving = f.editor.save()
    f.editor.form.primaryDirectory.root = '/workspace/next'
    result.resolve(true)
    await saving
    expect(f.save.mock.calls[0]?.[0].primaryDirectory?.root).toBe('/workspace/first')
    expect(f.editor.form.primaryDirectory.root).toBe('/workspace/next')
    expect(f.show.value).toBe(true)
  })

  it('blocks directory changes if a run becomes active during directory selection', async () => {
    const f = fixture()
    const selected = deferred<string | null>()
    f.selectDirectory.mockReturnValueOnce(selected.promise)
    const selecting = f.editor.selectPrimaryDirectory()
    f.target.value = { ...space('first'), activeRunCount: 1 }
    selected.resolve('/workspace/blocked')
    await selecting
    expect(f.editor.form.primaryDirectory).toBeNull()
    f.editor.form.primaryDirectory = { id: null, root: '/workspace/blocked' }
    expect(f.editor.canSave.value).toBe(false)
  })
})
