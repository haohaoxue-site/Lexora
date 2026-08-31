import { Type } from 'typebox'

const artifactId = Type.String({ maxLength: 256, minLength: 1, pattern: '\\S' })

export const artifactListParameters = Type.Object({
  limit: Type.Optional(Type.Integer({ maximum: 16, minimum: 1 })),
}, { additionalProperties: false })

export const artifactGetParameters = Type.Object({
  artifactId,
}, { additionalProperties: false })

export const artifactCheckoutParameters = Type.Object({
  artifactId,
}, { additionalProperties: false })

export const artifactPresentParameters = Type.Object({
  files: Type.Array(Type.Object({
    outputName: Type.String({
      description: 'Semantic file name shown to the user, including the meaningful extension.',
      maxLength: 255,
      minLength: 1,
      pattern: '^[^/\\\\]+$',
    }),
    path: Type.String({ maxLength: 4096, minLength: 1, pattern: '\\S' }),
    sourceArtifactId: Type.Optional(artifactId),
  }, { additionalProperties: false }), {
    maxItems: 16,
    minItems: 1,
  }),
}, { additionalProperties: false })
