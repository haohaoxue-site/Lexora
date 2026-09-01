import type { RuntimeRpcPeerContract } from '../../../shared/runtimeRpcPeer'
import type { SpaceDirectoryAuthorizationResult, SpaceService } from './SpaceService'
import {
  SPACE_ADDITIONAL_DIRECTORY_SELECTION_HOST_METHOD,
  spaceAdditionalDirectorySelectionResultSchema,
} from '../../../shared/spaceDirectoryAuthorization'

const DIRECTORY_SELECTION_TIMEOUT_MS = 30 * 60 * 1_000

export interface SpaceDirectoryAuthorizationServiceOptions {
  host: Pick<RuntimeRpcPeerContract, 'request'>
  onGranted: (spaceId: string) => Promise<unknown>
  spaces: Pick<SpaceService, 'grantAdditionalDirectory'>
}

export class SpaceDirectoryAuthorizationService {
  readonly #host: SpaceDirectoryAuthorizationServiceOptions['host']
  readonly #onGranted: SpaceDirectoryAuthorizationServiceOptions['onGranted']
  readonly #spaces: SpaceDirectoryAuthorizationServiceOptions['spaces']

  constructor(options: SpaceDirectoryAuthorizationServiceOptions) {
    this.#host = options.host
    this.#onGranted = options.onGranted
    this.#spaces = options.spaces
  }

  async request(input: {
    signal: AbortSignal
    spaceId: string
  }): Promise<SpaceDirectoryAuthorizationResult | null> {
    input.signal.throwIfAborted()
    const selection = spaceAdditionalDirectorySelectionResultSchema.parse(
      await this.#host.request(
        SPACE_ADDITIONAL_DIRECTORY_SELECTION_HOST_METHOD,
        {},
        DIRECTORY_SELECTION_TIMEOUT_MS,
      ),
    )
    input.signal.throwIfAborted()
    if (selection.root === null)
      return null

    const authorization = await this.#spaces.grantAdditionalDirectory({
      root: selection.root,
      spaceId: input.spaceId,
    })
    if (authorization.created)
      await this.#onGranted(input.spaceId)
    return authorization
  }
}
