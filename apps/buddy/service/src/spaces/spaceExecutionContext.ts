import type { SpaceExecutionContext } from '../../../shared/space'
import type { SpaceRecord } from '../storage/spaceRepository'
import { spaceExecutionContextSchema } from '../../../shared/space'

export function createSpaceExecutionContext(
  space: Pick<SpaceRecord, 'additionalDirectories' | 'id' | 'primaryDirectory'>,
): SpaceExecutionContext {
  return spaceExecutionContextSchema.parse({
    additionalDirectoryBindings: [...space.additionalDirectories]
      .sort(compareDirectoryBindings)
      .map(directory => ({
        id: directory.id,
        revision: directory.revision,
      })),
    primaryDirectoryBinding: space.primaryDirectory
      ? {
          id: space.primaryDirectory.id,
          revision: space.primaryDirectory.revision,
        }
      : null,
    spaceId: space.id,
  })
}

export function matchesSpaceExecutionContext(
  space: Pick<SpaceRecord, 'additionalDirectories' | 'id' | 'primaryDirectory'>,
  context: SpaceExecutionContext,
): boolean {
  return JSON.stringify(createSpaceExecutionContext(space)) === JSON.stringify(context)
}

function compareDirectoryBindings(
  left: SpaceRecord['additionalDirectories'][number],
  right: SpaceRecord['additionalDirectories'][number],
): number {
  return left.id.localeCompare(right.id)
}
