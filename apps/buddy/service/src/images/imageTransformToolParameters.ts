import { Type } from 'typebox'

export const imageTransformParameters = Type.Object({
  despill: Type.Optional(Type.Number({ maximum: 1, minimum: 0 })),
  keyColor: Type.Optional(Type.String({ pattern: '^#[0-9A-Fa-f]{6}$' })),
  outputPath: Type.String({
    description: 'PNG output path in the current workspace. The .png extension is optional.',
    maxLength: 4096,
    minLength: 1,
    pattern: '\\S',
  }),
  softness: Type.Optional(Type.Number({ maximum: 442, minimum: 0 })),
  sourceArtifactId: Type.String({ maxLength: 256, minLength: 1, pattern: '\\S' }),
  tolerance: Type.Optional(Type.Number({ maximum: 442, minimum: 0 })),
}, { additionalProperties: false })
