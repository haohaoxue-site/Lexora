import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({ name: 'lexora-buddy-mcp-fixture', version: '1.0.0' })

server.registerTool('echo_read', {
  annotations: {
    destructiveHint: false,
    openWorldHint: false,
    readOnlyHint: true,
  },
  description: 'Echo text without external side effects',
  inputSchema: { text: z.string() },
}, async ({ text }) => ({
  content: [{ type: 'text', text: `echo:${text}` }],
}))

server.registerTool('write_remote', {
  annotations: {
    destructiveHint: true,
    openWorldHint: true,
    readOnlyHint: false,
  },
  description: 'Write to a remote fixture',
  inputSchema: { text: z.string() },
}, async ({ text }) => ({
  content: [{ type: 'text', text: `written:${text}` }],
}))

await server.connect(new StdioServerTransport())

if (process.argv.includes('--exit-soon'))
  setTimeout(() => process.exit(9), 250)
