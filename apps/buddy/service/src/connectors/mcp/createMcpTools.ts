import type { ToolDefinition } from '@earendil-works/pi-coding-agent'
import type { TSchema } from 'typebox'
import type { BuddyToolClassification } from '../../agent/extensions/toolPolicyExtension'
import type { McpRemoteTool } from './McpClientSession'
import { Buffer } from 'node:buffer'
import { defineTool } from '@earendil-works/pi-coding-agent'

const MAX_DESCRIPTION_LENGTH = 2 * 1024
const MAX_INPUT_SCHEMA_BYTES = 64 * 1024
const MAX_RESULT_LENGTH = 64 * 1024

export interface McpToolSession {
  callTool: (name: string, arguments_: unknown, signal?: AbortSignal) => Promise<unknown>
}

export interface CreateMcpToolsOptions {
  serverId: string
  serverName: string
  session: McpToolSession
  tools: readonly McpRemoteTool[]
  trusted: boolean
}

export interface McpToolsResult {
  classifications: Map<string, BuddyToolClassification>
  diagnostics: Array<{ code: 'MCP_TOOL_INVALID', message: string }>
  tools: ToolDefinition[]
}

interface McpToolDetails {
  code?: string
  connectorTool: string
}

export function createMcpTools(options: CreateMcpToolsOptions): McpToolsResult {
  const classifications = new Map<string, BuddyToolClassification>()
  const diagnostics: McpToolsResult['diagnostics'] = []
  const tools: ToolDefinition[] = []
  const names = new Set<string>()

  for (const remoteTool of options.tools) {
    const name = createMcpToolName(options.serverName, remoteTool.name)
    if (names.has(name) || !isAllowedInputSchema(remoteTool.inputSchema)) {
      diagnostics.push({
        code: 'MCP_TOOL_INVALID',
        message: 'A Lexora Buddy connector tool has invalid or conflicting metadata',
      })
      continue
    }
    names.add(name)
    tools.push(createToolDefinition(name, remoteTool, options.session))
    classifications.set(name, classifyTool(options.serverId, options.trusted, remoteTool))
  }
  return { classifications, diagnostics, tools }
}

export function createMcpToolName(serverName: string, toolName: string): string {
  return `mcp__${normalizeName(serverName)}__${normalizeName(toolName)}`
}

function createToolDefinition(
  name: string,
  remoteTool: McpRemoteTool,
  session: McpToolSession,
): ToolDefinition {
  return defineTool<TSchema, McpToolDetails>({
    description: sanitizeDescription(remoteTool.description),
    execute: async (_toolCallId, parameters, signal) => {
      try {
        const result = await session.callTool(remoteTool.name, parameters, signal)
        const normalized = normalizeMcpResult(result)
        return {
          content: [{ type: 'text', text: normalized.text }],
          details: { connectorTool: name },
          isError: normalized.isError,
        }
      }
      catch {
        return {
          content: [{ type: 'text', text: 'Lexora Buddy connector tool failed' }],
          details: { code: 'MCP_TOOL_FAILED', connectorTool: name },
          isError: true,
        }
      }
    },
    label: name,
    name,
    parameters: remoteTool.inputSchema as TSchema,
  })
}

function classifyTool(
  serverId: string,
  trusted: boolean,
  tool: McpRemoteTool,
): BuddyToolClassification {
  const readOnly = trusted
    && tool.annotations?.readOnlyHint === true
    && tool.annotations.destructiveHint !== true
    && tool.annotations.openWorldHint !== true
  return {
    source: 'mcp',
    resource: {
      kind: 'connector',
      projectId: serverId,
      trusted,
    },
    risk: readOnly ? 'read' : 'mcp',
  }
}

function isAllowedInputSchema(schema: McpRemoteTool['inputSchema']): boolean {
  try {
    return schema.type === 'object'
      && Buffer.byteLength(JSON.stringify(schema)) <= MAX_INPUT_SCHEMA_BYTES
  }
  catch {
    return false
  }
}

function sanitizeDescription(value: string | undefined): string {
  const description = value
    ? [...value].map(character => isControlCharacter(character) ? ' ' : character).join('').trim()
    : undefined
  return (description || 'Use a tool provided by a Lexora Buddy connector')
    .slice(0, MAX_DESCRIPTION_LENGTH)
}

function isControlCharacter(value: string): boolean {
  const code = value.codePointAt(0) ?? 0
  return code < 32 || code === 127
}

function normalizeMcpResult(value: unknown): { isError: boolean, text: string } {
  if (!isRecord(value))
    return { isError: true, text: 'Lexora Buddy connector returned an invalid result' }
  const parts: string[] = []
  if (Array.isArray(value.content)) {
    for (const content of value.content) {
      if (!isRecord(content))
        continue
      if (content.type === 'text' && typeof content.text === 'string')
        parts.push(content.text)
      else if (content.type === 'resource' && isRecord(content.resource) && typeof content.resource.text === 'string')
        parts.push(content.resource.text)
      else if (content.type === 'resource_link' && typeof content.name === 'string')
        parts.push(`[Resource: ${content.name}]`)
      else if (content.type === 'image' || content.type === 'audio')
        parts.push(`[${String(content.type)} omitted]`)
    }
  }
  if ('structuredContent' in value)
    parts.push(safeJson(value.structuredContent))
  const text = redactSecrets(parts.filter(Boolean).join('\n'))
    .slice(0, MAX_RESULT_LENGTH)
  return {
    isError: value.isError === true,
    text: text || 'Connector tool completed without text output',
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, (key, entry) => (
      /authorization|api[-_]?key|secret|token/i.test(key) ? '[REDACTED]' : entry
    ))
  }
  catch {
    return '[Unserializable connector output]'
  }
}

function redactSecrets(value: string): string {
  return value
    .replaceAll(/\bBearer\s+[\w.~+/=-]+/gi, 'Bearer [REDACTED]')
    .replaceAll(/((?:authorization|api[-_]?key|secret|token)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
}

function normalizeName(value: string): string {
  const normalized = value.toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/^_+|_+$/g, '')
    .slice(0, 48)
  return normalized || 'unnamed'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
