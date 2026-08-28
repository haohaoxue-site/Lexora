import type { CredentialInfo } from '@earendil-works/pi-ai'

export interface ProviderCredentialSource {
  list: () => Promise<readonly CredentialInfo[]>
}

export interface ProviderCredentialStatus {
  list: () => Promise<readonly CredentialInfo[]>
  listOrEmpty: () => Promise<readonly CredentialInfo[]>
}

export function createProviderCredentialStatus(
  source: ProviderCredentialSource,
): ProviderCredentialStatus {
  return {
    list: () => source.list(),
    async listOrEmpty() {
      try {
        return await source.list()
      }
      catch (error) {
        if (isCredentialStoreUnavailable(error))
          return []
        throw error
      }
    },
  }
}

function isCredentialStoreUnavailable(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && error.code === 'CREDENTIAL_STORE_UNAVAILABLE'
}
