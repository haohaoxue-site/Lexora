// @vitest-environment jsdom
import type { LocalArtifact, LocalArtifactText } from '@buddy-shared/artifacts/artifactApi'
import type { LocalChangeSetDetail, LocalChangeSetSummary } from '@buddy-shared/changes/changeApi'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'
import { deferred } from '../../../../../../__tests__/deferred'
import { useArtifactPreview } from '../useArtifactPreview'
import { useChangePreview } from '../useChangePreview'

const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()))
function own<T>(setup: () => T) {
  const scope = effectScope()
  scopes.push(scope)
  return { state: scope.run(setup)!, stop: () => scope.stop() }
}

describe('resource previews', () => {
  it.each(['resolve', 'reject'] as const)('ignores an old text request that finishes with %s', async (outcome) => {
    const first = deferred<LocalArtifactText>()
    const artifact = shallowRef(createArtifact('first'))
    const readText = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ artifactId: 'second', language: null, text: 'current' })
    const { state, stop } = own(() => useArtifactPreview({ artifact: () => artifact.value, readText: () => readText }))
    artifact.value = createArtifact('second')
    await nextTick()
    if (outcome === 'resolve')
      first.resolve({ artifactId: 'first', language: null, text: 'old' })
    else
      first.reject(new Error('old failure'))
    await nextTick()
    expect(state.textPreview.value?.text).toBe('current')
    expect(state.textPreviewFailed.value).toBe(false)
    const pending = deferred<LocalArtifactText>()
    readText.mockReturnValueOnce(pending.promise)
    artifact.value = createArtifact('third')
    stop()
    pending.resolve({ artifactId: 'third', language: null, text: 'disposed' })
    await nextTick()
    expect(state.textPreview.value).toBeNull()
  })

  it('reacts to a replacement reader and ignores old image errors', async () => {
    const artifact = shallowRef(createArtifact('first'))
    const reader = shallowRef(async () => ({ artifactId: 'first', language: null, text: 'before' }))
    const { state } = own(() => useArtifactPreview({ artifact: () => artifact.value, readText: () => reader.value }))
    await nextTick()
    reader.value = async () => ({ artifactId: 'first', language: null, text: 'after' })
    await nextTick()
    expect(state.textPreview.value?.text).toBe('after')
    artifact.value = { ...createArtifact('image-a'), mimeType: 'image/png' }
    const oldImage = document.createElement('img')
    oldImage.setAttribute('src', state.previewUrl.value!)
    artifact.value = { ...createArtifact('image-b'), mimeType: 'image/png' }
    state.failImage({ target: oldImage } as unknown as Event)
    expect(state.previewUrl.value).toContain('image-b')
  })

  it('keeps the selected change file and visible detail while the same set refreshes', async () => {
    const changeSet = shallowRef<LocalChangeSetSummary>(createChanges('set-a'))
    const refresh = deferred<LocalChangeSetDetail>()
    const getDetail = vi.fn().mockResolvedValueOnce(createChanges('set-a')).mockReturnValueOnce(refresh.promise)
    const { state } = own(() => useChangePreview({ changeSet: () => changeSet.value, getDetail: () => getDetail }))
    await nextTick()
    state.selectFile('second')
    changeSet.value = { ...changeSet.value, updatedAt: '2026-09-09T00:00:00.000Z' }
    expect(state.selectedFile.value?.id).toBe('second')
    expect(state.loading.value).toBe(false)
    refresh.resolve(createChanges('set-a'))
    await nextTick()
    expect(state.selectedFile.value?.id).toBe('second')
    getDetail.mockResolvedValueOnce({ ...createChanges('set-a'), files: createChanges('set-a').files.slice(0, 1) })
    changeSet.value = { ...changeSet.value, updatedAt: '2026-09-10T00:00:00.000Z' }
    await nextTick()
    expect(state.selectedFile.value?.id).toBe('first')
  })

  it('invalidates change loads across A to B to A and disposal', async () => {
    const pending = deferred<LocalChangeSetDetail>()
    const changeSet = shallowRef<LocalChangeSetSummary>(createChanges('a'))
    const getDetail = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(createChanges('current'))
    const { state, stop } = own(() => useChangePreview({ changeSet: () => changeSet.value, getDetail: () => getDetail }))
    changeSet.value = createChanges('b')
    changeSet.value = createChanges('a')
    await nextTick()
    pending.reject(new Error('old a'))
    await nextTick()
    expect(state.detail.value?.changeSetId).toBe('current')
    expect(state.failed.value).toBe(false)
    const last = deferred<LocalChangeSetDetail>()
    getDetail.mockReturnValueOnce(last.promise)
    changeSet.value = createChanges('last')
    stop()
    last.resolve(createChanges('last'))
    await nextTick()
    expect(state.detail.value).toBeNull()
  })
})

function createArtifact(id: string): LocalArtifact {
  return { artifactId: id, conversationId: 'conversation', createdAt: '2026-09-08T00:00:00.000Z', kind: 'file', mimeType: 'text/plain', name: `${id}.txt`, path: `/workspace/${id}.txt`, previewUrl: null, runId: 'run', sizeBytes: 10, sourceArtifactId: null, sourceToolCallId: 'tool', updatedAt: '2026-09-08T00:00:00.000Z' }
}
function createChanges(id: string): LocalChangeSetDetail {
  return { changeSetId: id, conversationId: 'conversation', coverage: 'complete', fileCount: 2, runId: 'run', status: 'completed', updatedAt: '2026-09-08T00:00:00.000Z', files: ['first', 'second'].map(id => ({ afterSizeBytes: 1, afterText: 'b', beforeSizeBytes: 1, beforeText: 'a', changeType: 'modified', id, language: 'typescript', path: `${id}.ts`, preview: 'text', redacted: false })) }
}
