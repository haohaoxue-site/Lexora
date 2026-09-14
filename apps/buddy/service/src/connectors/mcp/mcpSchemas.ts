import { z } from 'zod'
import { connectorConfigSchema } from '../../../../shared/connectors/connectorApi'

const credentialRef = z.string().trim().min(1).max(256).nullable()

export const mcpServerConfigSchema = z.discriminatedUnion('transport', [
  connectorConfigSchema.options[0].extend({ credentialRef }).strict(),
  connectorConfigSchema.options[1].extend({ credentialRef }).strict(),
])

export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>
