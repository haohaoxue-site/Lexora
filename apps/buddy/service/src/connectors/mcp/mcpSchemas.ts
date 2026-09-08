import { isAbsolute } from 'node:path'
import { z } from 'zod'
import { isSecureOrLoopbackHttpUrl } from '../../../../shared/network/networkSecurity'

const connectorIdSchema = z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)
const connectorNameSchema = z.string().trim().min(1).max(128)
const credentialReferenceSchema = z.string().trim().min(1).max(256).nullable()

const stdioServerSchema = z.object({
  args: z.array(z.string().max(4096)).max(128),
  command: z.string().trim().min(1).max(4096),
  credentialRef: credentialReferenceSchema,
  cwd: z.string().trim().refine(isAbsolute).nullable(),
  enabled: z.boolean(),
  id: connectorIdSchema,
  name: connectorNameSchema,
  transport: z.literal('stdio'),
}).strict()

const streamableHttpServerSchema = z.object({
  credentialRef: credentialReferenceSchema,
  enabled: z.boolean(),
  id: connectorIdSchema,
  name: connectorNameSchema,
  transport: z.literal('streamable-http'),
  url: z.url().refine(isSecureOrLoopbackHttpUrl),
}).strict()

export const mcpServerConfigSchema = z.discriminatedUnion('transport', [
  stdioServerSchema,
  streamableHttpServerSchema,
])

export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>
