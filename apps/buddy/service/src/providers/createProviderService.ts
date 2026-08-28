import type { DatabaseSync } from 'node:sqlite'
import type { RuntimeRpcPeerContract } from '../../../shared/runtimeRpcPeer'
import type { ProviderRepository } from '../storage/providerRepository'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { registerBunOAuthFlows } from '@earendil-works/pi-ai/bun-oauth'
import { ModelRuntime } from '@earendil-works/pi-coding-agent'
import { createProviderRepository } from '../storage/providerRepository'
import { AuthInteractionService } from './AuthInteractionService'
import { HostCredentialStore } from './HostCredentialStore'
import { createProviderCredentialStatus } from './ProviderCredentialStatus'
import { clearAmbientProviderCredentials } from './providerEnvironment'
import { OpenAiCompatibleModelDiscovery } from './ProviderModelDiscovery'
import { ProviderService } from './ProviderService'

export interface CreateProviderServiceOptions {
  agentDirectory: string
  database: DatabaseSync
  getActiveRuns?: () => ReadonlyArray<{ model: string, provider: string }>
  peer: RuntimeRpcPeerContract
  providers?: ProviderRepository
}

export async function createProviderService(
  options: CreateProviderServiceOptions,
): Promise<ProviderService> {
  clearAmbientProviderCredentials(process.env)
  registerBunOAuthFlows()
  await mkdir(options.agentDirectory, { mode: 0o700, recursive: true })
  await chmod(options.agentDirectory, 0o700)
  const modelsPath = join(options.agentDirectory, 'models.json')
  await writeFile(modelsPath, '{}\n', { encoding: 'utf8', mode: 0o600 })
  await chmod(modelsPath, 0o600)

  const credentials = new HostCredentialStore(options.peer)
  const modelRuntime = await ModelRuntime.create({
    allowModelNetwork: true,
    credentials,
    modelsPath,
    modelsStorePath: join(options.agentDirectory, 'models-store.json'),
  })
  const service = new ProviderService({
    authInteractions: new AuthInteractionService({
      notify: (method, params) => options.peer.notify(method, params),
      openExternal: async (url) => {
        await options.peer.request('host.openExternal', { url })
      },
    }),
    credentialStatus: createProviderCredentialStatus(credentials),
    getActiveRuns: options.getActiveRuns,
    modelDiscovery: new OpenAiCompatibleModelDiscovery({ credentials }),
    modelRuntime,
    providers: options.providers ?? createProviderRepository(options.database),
    sessionRuntime: modelRuntime,
  })
  await service.initializeProviders()
  return service
}
