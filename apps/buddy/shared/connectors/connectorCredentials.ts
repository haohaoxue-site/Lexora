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

export const editableConnectorCredentialSchema = z.discriminatedUnion('type', [
  stdioConnectorCredentialSchema,
  httpConnectorCredentialSchema,
])

export const oauthConnectorCredentialSchema = z.object({
  type: z.literal('oauth'),
  redirectUrl: z.url(),
  tokens: z.looseObject({
    access_token: z.string(),
    token_type: z.string(),
    issuer: z.string(),
    refresh_token: z.string().optional(),
    expires_in: z.number().optional(),
    scope: z.string().optional(),
  }).nullable(),
  clients: z.record(z.string(), z.looseObject({ client_id: z.string(), issuer: z.string() })),
}).strict()

export const connectorCredentialSchema = z.discriminatedUnion('type', [
  ...editableConnectorCredentialSchema.options,
  oauthConnectorCredentialSchema,
])

export type ConnectorCredential = z.infer<typeof connectorCredentialSchema>
export type EditableConnectorCredential = z.infer<typeof editableConnectorCredentialSchema>
export type OAuthConnectorCredential = z.infer<typeof oauthConnectorCredentialSchema>
