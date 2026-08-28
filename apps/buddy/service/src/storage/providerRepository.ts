import type { DatabaseSync } from 'node:sqlite'
import type { DefaultModelRepository } from './defaultModelRepository'
import type { ProviderConfigRepository } from './providerConfigRepository'
import type { ProviderModelStateRepository } from './providerModelStateRepository'
import type { ProviderStateRepository } from './providerStateRepository'
import { createDefaultModelRepository } from './defaultModelRepository'
import { createProviderConfigRepository } from './providerConfigRepository'
import { createProviderModelStateRepository } from './providerModelStateRepository'
import { createProviderStateRepository } from './providerStateRepository'

export interface ProviderRepository {
  readonly configs: ProviderConfigRepository
  readonly defaultModel: DefaultModelRepository
  readonly models: ProviderModelStateRepository
  readonly states: ProviderStateRepository
}

export function createProviderRepository(database: DatabaseSync): ProviderRepository {
  return {
    configs: createProviderConfigRepository(database),
    defaultModel: createDefaultModelRepository(database),
    models: createProviderModelStateRepository(database),
    states: createProviderStateRepository(database),
  }
}
