import type { ComposerFollowupTarget } from '../useComposerTarget'
import { createBuddyUserContent } from '@buddy-shared/conversation/buddyUserContent'
import { afterEach, describe, expect, it } from 'vitest'
import { computed, effectScope, nextTick, shallowRef } from 'vue'
import { useChatDrafts } from '../../drafts/useChatDrafts'
import { useComposerTarget } from '../useComposerTarget'

const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()))

function fixture(persist: () => Promise<boolean> = async () => true) {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(() => {
    const conversationId = shallowRef('conversation')
    const branchId = shallowRef('current')
    const drafts = useChatDrafts({ targetKey: computed(() => `conversation:${conversationId.value}:${branchId.value}`), onChange: () => {} })
    const targets = useComposerTarget({ conversationId, branchId, drafts, persist })
    const beginFollowup = (id: string) => targets.beginFollowup({ kind: 'message_followup', conversationId: conversationId.value, branchId: id, assistantMessageId: `message-${id}` } satisfies ComposerFollowupTarget, () => true)
    return { targets, beginFollowup, drafts, conversationId, branchId }
  })!
}

describe('composer targets', () => {
  it('shares one target between editing and followup and preserves drafts when leaving an edit', async () => {
    const { targets, beginFollowup, drafts, branchId } = fixture()
    await beginFollowup('a')
    drafts.updateComposerContent('followup draft', null)
    expect(targets.beginEdit({ kind: 'message_edit', conversationId: 'conversation', branchId: 'current', userMessageId: 'question' }, createBuddyUserContent('edited question'))).toBe(true)
    expect(targets.followup.value).toBeNull()
    expect(targets.editing.value?.userMessageId).toBe('question')
    expect(await beginFollowup('b')).toBe(false)
    branchId.value = 'other'
    expect(targets.editing.value).toBeNull()
    drafts.updateComposerContent('another branch draft', null)
    targets.cancel('message-edit:conversation:current:question')
    expect(drafts.draft.value).toBe('another branch draft')
    branchId.value = 'current'
    await beginFollowup('a')
    expect(drafts.draft.value).toBe('followup draft')
  })

  it('keeps one active placeholder and restores each source draft and the original branch draft', async () => {
    const { targets, beginFollowup, drafts, branchId } = fixture()
    await nextTick()
    drafts.updateComposerContent('original draft', null)
    expect(await beginFollowup('a')).toBe(true)
    drafts.updateComposerContent('draft after A', null)
    expect(await beginFollowup('b')).toBe(true)
    expect(drafts.draft.value).toBe('')
    drafts.updateComposerContent('draft after B', null)
    expect(await beginFollowup('a')).toBe(true)
    expect(drafts.draft.value).toBe('draft after A')
    expect(targets.followup.value?.assistantMessageId).toBe('message-a')
    targets.cancelFollowup()
    expect(targets.followup.value).toBeNull()
    expect(drafts.draft.value).toBe('original draft')
    await beginFollowup('b')
    branchId.value = 'other'
    expect(targets.followup.value).toBeNull()
    branchId.value = 'current'
    expect(drafts.targetKey.value).toBe('conversation:conversation:current')
    await beginFollowup('b')
    expect(drafts.draft.value).toBe('draft after B')
  })

  it('ignores an older selection when persistence resolves out of order and cancels pending selection on navigation', async () => {
    const pending: ((value: boolean) => void)[] = []
    let block = true
    const { targets, beginFollowup, drafts, conversationId } = fixture(() => block ? new Promise(resolve => pending.push(resolve)) : Promise.resolve(true))
    await nextTick()
    const older = beginFollowup('a')
    const newer = beginFollowup('b')
    block = false
    pending[1]!(true)
    expect(await newer).toBe(true)
    pending[0]!(true)
    expect(await older).toBe(false)
    expect(targets.followup.value?.assistantMessageId).toBe('message-b')
    targets.cancelFollowup()
    block = true
    const abandoned = beginFollowup('a')
    conversationId.value = 'another'
    pending[2]!(true)
    expect(await abandoned).toBe(false)
    expect(targets.followup.value).toBeNull()
    expect(drafts.targetKey.value).toBe('conversation:another:current')
  })
})
