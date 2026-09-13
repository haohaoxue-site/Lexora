import type { ProviderHeaders } from '@earendil-works/pi-ai'
import type { ProviderRequestHeader } from '../../../shared/providers/providerHeaders'
import type { ProviderStateRepository } from '../storage/providerStateRepository'
import { providerHeaderValueSchema, providerRequestHeadersSchema } from '../../../shared/providers/providerHeaders'
import { ProviderAuthenticationRequiredError, ProviderValidationError } from './ProviderFailure'

export class ProviderRequestHeaders {
  readonly #states: ProviderStateRepository

  constructor(states: ProviderStateRepository) {
    this.#states = states
  }

  list(providerId: string): ProviderRequestHeader[] {
    return this.#states.getRequestHeaders(providerId)
  }

  save(providerId: string, input: readonly ProviderRequestHeader[]): void {
    const parsed = providerRequestHeadersSchema.safeParse(input)
    if (!parsed.success)
      throw new ProviderValidationError()
    this.#states.setRequestHeaders(providerId, parsed.data)
  }

  resolve(providerId: string, defaults?: ProviderHeaders, apiKey?: string): ProviderHeaders {
    const headers = new Map(Object.entries(defaults ?? {}).map(([name, value]) => [name.toLowerCase(), value]))
    for (const header of this.list(providerId)) {
      const value = header.value === ''
        ? null
        : header.value.replaceAll(`\${apiKey}`, () => {
            if (!apiKey)
              throw new ProviderAuthenticationRequiredError()
            return apiKey
          })
      if (value !== null && !providerHeaderValueSchema.safeParse(value).success)
        throw new ProviderValidationError()
      headers.set(header.name.toLowerCase(), value)
    }
    return Object.fromEntries(headers)
  }
}
