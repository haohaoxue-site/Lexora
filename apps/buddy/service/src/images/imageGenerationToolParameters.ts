import { Type } from 'typebox'

export const imageGenerationParameters = Type.Object({
  outputPath: Type.String({
    description: 'Output file path in the current workspace. The image extension is optional.',
    maxLength: 4096,
    minLength: 1,
    pattern: '\\S',
  }),
  prompt: Type.String({ maxLength: 32 * 1024, minLength: 1, pattern: '\\S' }),
  reference: Type.Optional(Type.Union([
    Type.Object({
      mode: Type.Literal('latest'),
    }, { additionalProperties: false }),
    Type.Object({
      resourceIds: Type.Array(Type.String({ maxLength: 256, minLength: 1 }), {
        maxItems: 4,
        minItems: 1,
        uniqueItems: true,
      }),
      mode: Type.Literal('resources'),
    }, { additionalProperties: false }),
  ])),
}, { additionalProperties: false })
