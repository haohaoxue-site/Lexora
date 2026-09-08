import type { LocalConnector } from '@buddy-shared/connectors/connectorApi'
import type { LocalSkillCatalog } from '@buddy-shared/skills/skillApi'
import type { LocalCapabilitiesOptions } from '../typing'
import { describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import { deferred } from '../../../../../__tests__/deferred'
import { useConnectorSettings } from '../useConnectorSettings'
import { useSkillCatalog } from '../useSkillCatalog'

function catalog(name: string): LocalSkillCatalog {
  return { diagnostics: [], skills: [{ description: name, enabled: true, name, source: 'space' }] }
}

const connector: LocalConnector = {
  credentialConfigured: false,
  enabled: true,
  id: 'example',
  name: 'Example',
  transport: 'streamable-http',
  trusted: true,
  url: 'https://example.test/mcp',
}

function options() {
  return {
    api: {
      connectors: {
        clearCredential: vi.fn().mockResolvedValue({ updated: true }),
        list: vi.fn<LocalCapabilitiesOptions['api']['connectors']['list']>().mockResolvedValue([]),
        remove: vi.fn().mockResolvedValue({ updated: true }),
        setCredential: vi.fn().mockResolvedValue({ updated: true }),
        trust: vi.fn().mockResolvedValue({ updated: true }),
        upsert: vi.fn<LocalCapabilitiesOptions['api']['connectors']['upsert']>().mockResolvedValue([connector]),
      },
      skills: { list: vi.fn<LocalCapabilitiesOptions['api']['skills']['list']>().mockResolvedValue(catalog('default')) },
    },
    language: shallowRef('zh-CN' as const),
  } satisfies LocalCapabilitiesOptions
}

describe('skill catalog ownership', () => {
  it('ignores errors from a space that is no longer selected', async () => {
    const input = options()
    const previous = deferred<LocalSkillCatalog>()
    input.api.skills.list.mockReturnValueOnce(previous.promise).mockResolvedValueOnce(catalog('latest'))
    const store = useSkillCatalog(input)
    const oldLoad = store.loadSkills('previous')
    await store.loadSkills('latest')
    previous.reject(new Error('Unavailable previous space'))
    expect(await oldLoad).toBe(false)
    expect(store.skills.value).toEqual(catalog('latest'))
    expect(store.skillsError.value).toBeNull()
    expect(store.isLoadingSkills.value).toBe(false)
  })

  it('invalidates a pending request when returning to the cached space', async () => {
    const input = options()
    const pending = deferred<LocalSkillCatalog>()
    input.api.skills.list.mockResolvedValueOnce(catalog('saved')).mockReturnValueOnce(pending.promise)
    const store = useSkillCatalog(input)
    await store.loadSkills('saved')
    const other = store.loadSkills('other')
    expect(store.skills.value.skills).toEqual([])
    await store.loadSkills('saved')
    pending.resolve(catalog('other'))
    expect(await other).toBe(false)
    expect(store.skills.value).toEqual(catalog('saved'))
    expect(store.isLoadingSkills.value).toBe(false)
  })

  it('does not publish a late catalog after disposal', async () => {
    const input = options()
    const pending = deferred<LocalSkillCatalog>()
    input.api.skills.list.mockReturnValueOnce(pending.promise)
    const store = useSkillCatalog(input)
    const loading = store.loadSkills()
    store.dispose()
    pending.resolve(catalog('disposed'))
    expect(await loading).toBe(false)
    expect(store.skills.value.skills).toEqual([])
  })

  it('refreshes the same space after its source directory changes', async () => {
    const input = options()
    input.api.skills.list.mockResolvedValueOnce(catalog('old-directory'))
      .mockResolvedValueOnce(catalog('new-directory'))
    const store = useSkillCatalog(input)
    await store.loadSkills('space')
    await store.loadSkills('space')
    expect(store.skills.value).toEqual(catalog('old-directory'))
    expect(await store.refreshSkills('space')).toBe(true)
    expect(store.skills.value).toEqual(catalog('new-directory'))
  })
})

describe('connector settings ownership', () => {
  it('keeps the confirmed mutation when an older list request finishes later', async () => {
    const input = options()
    const previous = deferred<readonly LocalConnector[]>()
    input.api.connectors.list.mockReturnValueOnce(previous.promise)
    const store = useConnectorSettings(input)
    const loading = store.loadConnectors()
    expect(await store.saveConnector({ config: connector, credential: { mode: 'keep' } })).toBe(true)
    previous.resolve([])
    expect(await loading).toBe(false)
    expect(store.connectors.value).toEqual([connector])
    expect(store.isLoadingConnectors.value).toBe(false)
  })

  it('applies queued edits in order and holds refresh until the final mutation completes', async () => {
    const input = options()
    const first = deferred<readonly LocalConnector[]>()
    const last = deferred<readonly LocalConnector[]>()
    input.api.connectors.upsert.mockReturnValueOnce(first.promise).mockReturnValueOnce(last.promise)
    const store = useConnectorSettings(input)
    const enabled = store.saveConnector({ config: connector, credential: { mode: 'keep' } })
    const disabledConnector = { ...connector, enabled: false }
    const disabled = store.saveConnector({ config: disabledConnector, credential: { mode: 'keep' } })
    const refresh = store.loadConnectors()
    expect(store.isMutatingConnectors.value).toBe(true)
    first.resolve([connector])
    await enabled
    expect(store.connectors.value).toEqual([connector])
    expect(store.isMutatingConnectors.value).toBe(true)
    last.resolve([disabledConnector])
    expect(await disabled).toBe(true)
    expect(await refresh).toBe(true)
    expect(store.connectors.value).toEqual([disabledConnector])
    expect(store.isMutatingConnectors.value).toBe(false)
  })

  it('reports a failed refresh after a mutation and clears the error after recovery', async () => {
    const input = options()
    input.api.connectors.list.mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValueOnce([connector])
    const store = useConnectorSettings(input)
    expect(await store.trustConnector(connector.id)).toBe(false)
    expect(store.connectorsError.value).not.toBeNull()
    expect(await store.loadConnectors()).toBe(true)
    expect(store.connectors.value).toEqual([connector])
    expect(store.connectorsError.value).toBeNull()
  })
})
