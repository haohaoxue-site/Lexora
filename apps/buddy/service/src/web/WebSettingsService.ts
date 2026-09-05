import type { RuntimeRpcPeerContract } from '../../../shared/runtimeRpcPeer'
import type { WebSettings, WebSettingsSnapshot } from '../../../shared/webProtocol'
import type { WorkspaceRepository } from '../storage/workspaceRepository'
import { credentialMutationResultSchema, credentialReadResultSchema } from '../../../shared/credentialProtocol'
import { DEFAULT_WEB_SETTINGS, webCredentialInputSchema, webSearchSourceSchema, webSettingsSchema } from '../../../shared/webProtocol'
import { HostCredentialStoreError } from '../providers/HostCredentialStore'
import { BuddyServiceError, parse } from '../rpc/runtimeRequest'

const SETTINGS_KEY = 'buddy.web'
const storedSettingsSchema = webSettingsSchema.extend({
  search: webSearchSourceSchema.array().refine(sources => new Set(sources.map(source => source.provider)).size === sources.length),
})

export class WebSettingsService {
  readonly repository: Pick<WorkspaceRepository, 'get' | 'set'>
  readonly peer: Pick<RuntimeRpcPeerContract, 'request'>
  #mutation: Promise<unknown> = Promise.resolve()

  constructor(
    repository: Pick<WorkspaceRepository, 'get' | 'set'>,
    peer: Pick<RuntimeRpcPeerContract, 'request'>,
  ) {
    this.repository = repository
    this.peer = peer
  }

  get(): WebSettings {
    const settings = storedSettingsSchema.parse(this.repository.get(SETTINGS_KEY) ?? DEFAULT_WEB_SETTINGS)
    const providers = new Set(settings.search.map(source => source.provider))
    settings.search.push(...DEFAULT_WEB_SETTINGS.search.filter(source => !providers.has(source.provider)).map(source => ({ ...source })))
    return settings
  }

  async snapshot(): Promise<WebSettingsSnapshot> {
    return { settings: this.get(), tavilyKeyConfigured: Boolean(await this.getTavilyKey()) }
  }

  async getTavilyKey(): Promise<string | null> {
    const result = credentialReadResultSchema.parse(await this.peer.request('host.secrets.read', {
      namespace: 'web',
      id: 'tavily',
    }))
    if (!result.ok)
      throw new HostCredentialStoreError(result.error.code)
    return typeof result.value === 'string' && result.value ? result.value : null
  }

  save(input: unknown): Promise<WebSettingsSnapshot> {
    const settings = parse(webSettingsSchema, input)
    return this.#mutate(async () => {
      const tavilyKeyConfigured = Boolean(await this.getTavilyKey())
      if (!tavilyKeyConfigured && (settings.fetch.remote || settings.search.some(source => source.provider === 'tavily' && source.enabled)))
        throw new BuddyServiceError('VALIDATION_FAILED')
      this.repository.set(SETTINGS_KEY, settings, new Date().toISOString())
      return { settings, tavilyKeyConfigured }
    })
  }

  saveCredential(input: unknown): Promise<WebSettingsSnapshot> {
    const { key } = parse(webCredentialInputSchema, input)
    return this.#mutate(async () => {
      const previouslyConfigured = Boolean(await this.getTavilyKey())
      if (key === null || !previouslyConfigured) {
        const settings = this.get()
        settings.search = settings.search.map(source => source.provider === 'tavily' ? { ...source, enabled: false } : source)
        settings.fetch.remote = false
        this.repository.set(SETTINGS_KEY, settings, new Date().toISOString())
      }
      const result = credentialMutationResultSchema.parse(await this.peer.request(
        key === null ? 'host.secrets.delete' : 'host.secrets.write',
        { namespace: 'web', id: 'tavily', ...(key === null ? {} : { value: key }) },
      ))
      if (!result.ok)
        throw new HostCredentialStoreError(result.error.code)
      return this.snapshot()
    })
  }

  #mutate(operation: () => Promise<WebSettingsSnapshot>): Promise<WebSettingsSnapshot> {
    const result = this.#mutation.then(operation)
    this.#mutation = result.catch(() => {})
    return result
  }
}

export function registerWebSettingsRpc(rpc: Pick<RuntimeRpcPeerContract, 'onRequest'>, service: WebSettingsService): () => void {
  const disposers = [
    rpc.onRequest('web.settings', () => service.snapshot()),
    rpc.onRequest('web.saveSettings', input => service.save(input)),
    rpc.onRequest('web.saveCredential', input => service.saveCredential(input)),
  ]
  return () => disposers.forEach(dispose => dispose())
}
