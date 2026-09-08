import type { RuntimeRequestContract } from '../runtime/apiContract'

import type { DeepReadonly } from '../runtime/apiValidation'
import { z } from 'zod'
import { idSchema, isAbsolutePath, validationRequestSchemas, validationResponseSchemas } from '../runtime/apiValidation'
import { connectorCredentialSchema as runtimeConnectorCredentialSchema } from './connectorCredentials'

export const connectorBaseSchema = z.object({
  credentialConfigured: z.boolean(),
  enabled: z.boolean(),
  id: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  name: z.string().trim().min(1).max(128),
  trusted: z.boolean(),
})

export const connectorSchema = z.discriminatedUnion('transport', [
  connectorBaseSchema.extend({
    args: z.array(z.string()),
    command: z.string().min(1),
    cwd: z.string().nullable(),
    transport: z.literal('stdio'),
  }).strict(),
  connectorBaseSchema.extend({
    transport: z.literal('streamable-http'),
    url: z.url(),
  }).strict(),
])

export const connectorConfigSchema = z.discriminatedUnion('transport', [
  z.object({
    args: z.array(z.string().max(4096)).max(128),
    command: z.string().trim().min(1).max(4096),
    cwd: z.string().trim().refine(isAbsolutePath).nullable(),
    enabled: z.boolean(),
    id: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
    name: z.string().trim().min(1).max(128),
    transport: z.literal('stdio'),
  }).strict(),
  z.object({
    enabled: z.boolean(),
    id: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
    name: z.string().trim().min(1).max(128),
    transport: z.literal('streamable-http'),
    url: z.url(),
  }).strict(),
])

export const connectorCredentialSchema = z.discriminatedUnion('type', [
  z.object({
    env: z.record(z.string().regex(/^[A-Z_]\w*$/i), z.string().max(16 * 1024)),
    type: z.literal('stdio'),
  }).strict(),
  z.object({
    bearerToken: z.string().min(1).max(64 * 1024).optional(),
    headers: z.record(z.string().min(1), z.string().max(16 * 1024)).optional(),
    type: z.literal('http'),
  }).strict(),
])

export const connectorCredentialMutationSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('keep') }).strict(),
  z.object({ mode: z.literal('clear') }).strict(),
  z.object({ mode: z.literal('replace'), value: connectorCredentialSchema }).strict(),
])

export type LocalConnector = DeepReadonly<z.infer<typeof connectorSchema>>

export type LocalConnectorConfig = z.infer<typeof connectorConfigSchema>

export type LocalConnectorCredential = z.infer<typeof connectorCredentialSchema>

export type LocalConnectorCredentialMutation = z.infer<typeof connectorCredentialMutationSchema>

export const connectorsRequestSchemas = {
  connectorCredential: z.object({
    connectorId: idSchema,
    credential: connectorCredentialSchema,
  }).strict(),
  connectorId: z.object({ connectorId: idSchema }).strict(),
  connectorUpsert: z.object({
    config: connectorConfigSchema,
    credential: connectorCredentialMutationSchema,
  }).strict(),
} as const

export const connectorsResponseSchemas = {
  connectors: z.array(connectorSchema),
} as const

const runtimeConnectorCredentialMutationSchema = z.discriminatedUnion('mode', [z.object({ mode: z.literal('keep') }).strict(), z.object({ mode: z.literal('clear') }).strict(), z.object({ mode: z.literal('replace'), value: runtimeConnectorCredentialSchema }).strict()])

export const connectorsRpc = {
  list: { method: 'connectors.list', input: validationRequestSchemas.empty, response: connectorsResponseSchemas.connectors },
  upsert: { method: 'connectors.upsert', input: z.object({ config: z.discriminatedUnion('transport', [connectorConfigSchema.options[0].extend({ cwd: z.string().nullable() }).strict(), connectorConfigSchema.options[1]]), credential: runtimeConnectorCredentialMutationSchema }).strict(), response: connectorsResponseSchemas.connectors },
  remove: { method: 'connectors.remove', input: connectorsRequestSchemas.connectorId, response: validationResponseSchemas.mutation },
  trust: { method: 'connectors.trust', input: connectorsRequestSchemas.connectorId, response: validationResponseSchemas.mutation },
  saveCredential: { method: 'connectors.saveCredential', input: z.object({ connectorId: idSchema, credential: runtimeConnectorCredentialSchema }).strict(), response: validationResponseSchemas.mutation },
  clearCredential: { method: 'connectors.clearCredential', input: connectorsRequestSchemas.connectorId, response: validationResponseSchemas.mutation },
} as const satisfies Record<string, RuntimeRequestContract>
