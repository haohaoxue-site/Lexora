import { describe, expect, it } from 'vitest'
import { effectScope } from 'vue'
import { useWebCredentialInput } from '../useWebCredentialInput'

function fixture(reveal = async (): Promise<string | null> => 'fixture-private-key') {
  const scope = effectScope()
  const saved: Array<string | null> = []
  const input = scope.run(() => useWebCredentialInput({
    configured: () => true,
    reveal,
    save: async (key) => {
      saved.push(key)
      return true
    },
  }))!
  return { input, saved, scope }
}

describe('web credential input', () => {
  it('keeps stored credentials masked until revealed, and never saves the mask', async () => {
    let reads = 0
    const { input, saved, scope } = fixture(async () => {
      reads++
      return 'fixture-private-key'
    })
    expect(input.value.value).toBe('****')
    await input.save()
    expect(saved).toEqual([])
    expect(reads).toBe(0)
    await input.toggleVisibility()
    expect(input.value.value).toBe('fixture-private-key')
    expect(input.canSave.value).toBe(false)
    await input.toggleVisibility()
    expect(input.value.value).toBe('****')
    scope.stop()
  })

  it('replaces or removes keys using the draft, not the displayed mask', async () => {
    const { input, saved, scope } = fixture()
    expect(input.value.value).toBe('****')
    expect(input.canSave.value).toBe(false)
    input.update(' replacement-fixture-key ')
    await input.save()
    expect(saved).toEqual(['replacement-fixture-key'])
    expect(input.value.value).toBe('****')
    input.update('')
    await input.save()
    expect(saved).toEqual(['replacement-fixture-key', null])
    input.update('****')
    await input.save()
    expect(saved).toHaveLength(2)
    scope.stop()
  })

  it('discards a pending reveal after editing or leaving the page', async () => {
    const pending = Promise.withResolvers<string | null>()
    const { input, scope } = fixture(() => pending.promise)
    const revealing = input.toggleVisibility()
    input.update('replacement-fixture-key')
    pending.resolve('stale-private-key')
    await revealing
    expect(input.value.value).toBe('replacement-fixture-key')
    expect(input.visible.value).toBe(false)
    scope.stop()
    expect(input.value.value).toBe('****')

    const late = Promise.withResolvers<string | null>()
    const other = fixture(() => late.promise)
    const request = other.input.toggleVisibility()
    other.scope.stop()
    late.resolve('late-private-key')
    await request
    expect(other.input.value.value).toBe('****')
    expect(other.input.visible.value).toBe(false)
  })

  it('retains masked state on a failed reveal and permits retry', async () => {
    let failing = true
    const { input, scope } = fixture(async () => {
      if (failing)
        throw new Error('fixture failure with private data')
      return 'fixture-private-key'
    })
    await input.toggleVisibility()
    expect(input.value.value).toBe('****')
    expect(input.revealFailed.value).toBe(true)
    failing = false
    await input.toggleVisibility()
    expect(input.value.value).toBe('fixture-private-key')
    expect(input.revealFailed.value).toBe(false)
    scope.stop()
  })
})
