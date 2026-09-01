import type { SpaceRecord } from '../storage/spaceRepository'
import { BuddyServiceError } from '../rpc/runtimeRequest'

export function requireActiveSpace(space: SpaceRecord | null): SpaceRecord {
  if (!space || space.revokedAt !== null)
    throw new BuddyServiceError('SPACE_UNAVAILABLE')
  return space
}
