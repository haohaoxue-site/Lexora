import type { Provider, ProviderRequestOptions } from '@earendil-works/pi-ai'
import type { ProviderRequestHeaders } from './ProviderRequestHeaders'
import { lazyStream } from '@earendil-works/pi-ai'

export function withProviderRequestHeaders(provider: Provider, headers: ProviderRequestHeaders): Provider {
  async function prepare<T extends ProviderRequestOptions>(options?: T): Promise<T & ProviderRequestOptions> {
    return {
      ...options,
      headers: await headers.resolve(provider.id, options?.headers, options?.apiKey),
    } as T & ProviderRequestOptions
  }
  return {
    ...provider,
    stream: (model, context, options) => lazyStream(model, async () => provider.stream(model, context, await prepare(options))),
    streamSimple: (model, context, options) => lazyStream(model, async () => provider.streamSimple(model, context, await prepare(options))),
    fetchDeferred: provider.fetchDeferred
      ? (model, handle, options) => lazyStream(model, async () => provider.fetchDeferred!(model, handle, await prepare(options)))
      : undefined,
    cancelDeferred: provider.cancelDeferred
      ? async (model, handle, options) => provider.cancelDeferred!(model, handle, await prepare(options))
      : undefined,
  }
}
