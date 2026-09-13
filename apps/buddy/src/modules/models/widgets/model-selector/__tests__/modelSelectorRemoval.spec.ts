// @vitest-environment jsdom
import type { LocalRuntimeModelOption } from '@buddy-shared/providers/providerApi'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick, shallowReactive } from 'vue'
import { modelKey } from '../../../model/modelSelection'
import DesktopModelSelector from '../DesktopModelSelector.vue'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))

describe('model selector after service removal', () => {
  it.each([false, true])('replaces a deleted model label and offers only available choices (remaining: %s)', async (hasRemaining) => {
    const deleted = model('builtin-removed', 'Removed model')
    const remaining = model('service-remaining', 'Remaining model')
    const props = shallowReactive({
      disabled: false,
      language: 'zh-CN' as const,
      models: [deleted, remaining] as ReadonlyArray<LocalRuntimeModelOption>,
      providers: [],
      selectedEffort: 'high' as const,
      selectedModel: deleted as LocalRuntimeModelOption | null,
      selectedModelId: modelKey(deleted),
      selectedServiceTier: null,
    })
    const root = document.createElement('div')
    document.body.append(root)
    const app = createApp({ setup: () => () => h(DesktopModelSelector, props) })
    app.mount(root)
    cleanups.push(() => {
      app.unmount()
      root.remove()
    })
    await nextTick()
    const trigger = root.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!
    expect(trigger.textContent).toContain('Removed model')

    props.selectedModel = null
    props.models = hasRemaining ? [remaining] : []
    await nextTick()
    expect(trigger.textContent?.trim()).toBe('选择模型')
    expect(root.textContent).not.toContain('builtin-removed')
    expect(trigger.disabled).toBe(!hasRemaining)
    if (hasRemaining) {
      trigger.click()
      await nextTick()
      expect(root.querySelector('[role="menuitemradio"]')?.textContent).toContain('Remaining model')

      props.models = []
      await nextTick()
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
      expect(root.querySelector('[role="menu"]')).toBeNull()
    }
  })
})

function model(providerId: string, displayName: string): LocalRuntimeModelOption {
  return {
    api: 'openai-completions',
    available: true,
    catalogMatch: 'not_applicable',
    catalog: { source: null, selection: null, candidates: [] },
    metadataKnown: true,
    capabilities: ['text'],
    fileInputMimeTypes: [],
    capabilityOverrides: null,
    sourceCapabilities: { image: false, reasoningOptions: ['off', 'high'] },
    contextWindow: 4096,
    displayName,
    enabled: true,
    hasParameterOverride: false,
    lastSeenAt: null,
    maxTokens: 1024,
    modelId: 'model',
    overrideContextWindow: null,
    overrideMaxTokens: null,
    providerId,
    reasoningOptions: ['off', 'high'],
    serviceTiers: [],
    source: 'builtin',
    sourceContextWindow: 4096,
    sourceMaxTokens: 1024,
    sourceParametersUpdated: false,
  }
}
