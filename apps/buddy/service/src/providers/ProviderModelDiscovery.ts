import type { Credential } from '@earendil-works/pi-ai'
import {
  ProviderAuthenticationRequiredError,
  ProviderModelSyncError,
  ProviderModelSyncUnsupportedError,
} from './ProviderFailure'

export interface ProviderModelDefinition {
  readonly id: string
  readonly name?: string
}

export interface ProviderModelDiscoveryInput {
  readonly api: string
  readonly baseUrl: string
  readonly providerId: string
}

export interface ProviderModelDiscovery {
  discover: (
    input: ProviderModelDiscoveryInput,
  ) => Promise<readonly ProviderModelDefinition[]>
  supports: (api: string) => boolean
}

export interface OpenAiCompatibleModelDiscoveryOptions {
  readonly credentials: {
    read: (providerId: string) => Promise<Credential | undefined>
  }
  readonly request?: typeof fetch
}

export class OpenAiCompatibleModelDiscovery implements ProviderModelDiscovery {
  readonly #credentials: OpenAiCompatibleModelDiscoveryOptions['credentials']
  readonly #request: typeof fetch

  constructor(options: OpenAiCompatibleModelDiscoveryOptions) {
    this.#credentials = options.credentials
    this.#request = options.request ?? fetch
  }

  supports(api: string): boolean {
    return api === 'openai-completions' || api === 'openai-responses'
  }

  async discover(
    input: ProviderModelDiscoveryInput,
  ): Promise<readonly ProviderModelDefinition[]> {
    if (!this.supports(input.api))
      throw new ProviderModelSyncUnsupportedError()
    const credential = await this.#credentials.read(input.providerId)
    if (credential?.type !== 'api_key' || !credential.key)
      throw new ProviderAuthenticationRequiredError()

    try {
      const baseUrl = input.baseUrl.endsWith('/') ? input.baseUrl : `${input.baseUrl}/`
      const response = await this.#request(new URL('models', baseUrl), {
        headers: { Authorization: `Bearer ${credential.key}` },
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok)
        throw new ProviderModelSyncError()
      return parseModelDefinitions(await response.json())
    }
    catch (error) {
      if (error instanceof ProviderModelSyncError)
        throw error
      throw new ProviderModelSyncError()
    }
  }
}

function parseModelDefinitions(value: unknown): readonly ProviderModelDefinition[] {
  if (!isRecord(value) || !Array.isArray(value.data))
    throw new ProviderModelSyncError()
  return value.data.map((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim())
      throw new ProviderModelSyncError()
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    return {
      id: item.id.trim(),
      ...(name ? { name } : {}),
    }
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
