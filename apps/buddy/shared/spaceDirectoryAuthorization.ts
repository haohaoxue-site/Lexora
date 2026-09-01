import { z } from 'zod'

export const SPACE_ADDITIONAL_DIRECTORY_SELECTION_HOST_METHOD
  = 'host.spaces.selectAdditionalDirectory'

export const spaceAdditionalDirectorySelectionParamsSchema = z.object({}).strict()

export const spaceAdditionalDirectorySelectionResultSchema = z.object({
  root: z.string().min(1).nullable(),
}).strict()
