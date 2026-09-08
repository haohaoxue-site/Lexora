import { z } from 'zod'

export const stdioConnectorCredentialSchema = z.object({
  env: z.record(
    z.string().regex(/^[A-Z_]\w*$/i),
    z.string().max(16 * 1024),
  ),
  type: z.literal('stdio'),
}).strict()

export const httpConnectorCredentialSchema = z.object({
  bearerToken: z.string().min(1).max(64 * 1024).optional(),
  headers: z.record(
    z.string().trim().regex(/^[!#$%&'*+.^\w`|~-]+$/),
    z.string().max(16 * 1024),
  ).optional(),
  type: z.literal('http'),
}).strict()

export const connectorCredentialSchema = z.discriminatedUnion('type', [
  stdioConnectorCredentialSchema,
  httpConnectorCredentialSchema,
])

export type ConnectorCredential = z.infer<typeof connectorCredentialSchema>
