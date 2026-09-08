import type { RuntimeRequestContract } from '../runtime/apiContract'
import type { DeepReadonly } from '../runtime/apiValidation'
import { z } from 'zod'
import { idSchema } from '../runtime/apiValidation'

export const skillSchema = z.object({
  description: z.string(),
  enabled: z.boolean(),
  name: z.string().min(1),
  source: z.enum(['builtin', 'directory', 'global', 'space']),
}).strict()

export const skillDiagnosticSchema = z.object({
  code: z.enum([
    'SKILL_INVALID',
    'SKILL_NAME_COLLISION',
    'SKILL_PATH_OUTSIDE_SOURCE',
    'SKILL_SOURCE_UNREADABLE',
  ]),
  message: z.string(),
}).strict()

export type LocalSkillCatalog = DeepReadonly<z.infer<typeof skillsResponseSchemas.skills>>

export const skillsRequestSchemas = {
  skillScope: z.object({ spaceId: idSchema.nullable() }).strict(),
} as const

export const skillsResponseSchemas = {
  skills: z.object({
    diagnostics: z.array(skillDiagnosticSchema),
    skills: z.array(skillSchema),
  }).strict(),
} as const

export const skillsRpc = {
  list: { method: 'skills.list', input: skillsRequestSchemas.skillScope, response: skillsResponseSchemas.skills },
} as const satisfies Record<string, RuntimeRequestContract>
