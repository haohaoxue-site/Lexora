import { describe, expect, it } from 'vitest'
import {
  reconcileDismissedChatBlocker,
  resolveChatBlocker,
} from '../chatBlocker'

describe('desktopChatBlocker', () => {
  it('uses the unified blocking priority and stays quiet while runtime starts', () => {
    expect(resolveChatBlocker({
      hasAvailableProvider: false,
      hasSelectedModel: false,
      runtimeError: '运行时启动失败',
      runtimeStatus: 'offline',
    })).toEqual({ dismissible: false, kind: 'runtime' })
    expect(resolveChatBlocker({
      hasAvailableProvider: false,
      hasSelectedModel: false,
      runtimeError: null,
      runtimeStatus: 'starting',
    })).toBeNull()
    expect(resolveChatBlocker({
      hasAvailableProvider: false,
      hasSelectedModel: false,
      runtimeError: null,
      runtimeStatus: 'ready',
    })).toEqual({ dismissible: true, kind: 'provider' })
    expect(resolveChatBlocker({
      hasAvailableProvider: true,
      hasSelectedModel: false,
      runtimeError: null,
      runtimeStatus: 'ready',
    })).toEqual({ dismissible: true, kind: 'model' })
    expect(resolveChatBlocker({
      hasAvailableProvider: true,
      hasSelectedModel: true,
      runtimeError: null,
      runtimeStatus: 'ready',
    })).toBeNull()
  })

  it('keeps an ignored blocker hidden only for the current continuous episode', () => {
    expect(reconcileDismissedChatBlocker('provider', { dismissible: true, kind: 'provider' }))
      .toBe('provider')
    expect(reconcileDismissedChatBlocker('provider', null)).toBeNull()
    expect(reconcileDismissedChatBlocker('provider', { dismissible: true, kind: 'model' }))
      .toBeNull()
  })
})
