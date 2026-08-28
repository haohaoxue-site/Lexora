import { Type } from 'typebox'

export const artifactPresentParameters = Type.Object({
  files: Type.Array(Type.Object({
    outputName: Type.String({
      description: 'Semantic file name shown to the user, including the meaningful extension.',
      maxLength: 255,
      minLength: 1,
      pattern: '^[^/\\\\]+$',
    }),
    path: Type.String({ maxLength: 4096, minLength: 1, pattern: '\\S' }),
  }, { additionalProperties: false }), {
    maxItems: 16,
    minItems: 1,
  }),
}, { additionalProperties: false })
