import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import process from 'node:process'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { InitializeRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'

const server = new McpServer({ name: 'buddy-process-fixture', version: '1.0.0' })
const environmentKeys = ['LANG', 'XDG_CONFIG_HOME', 'https_proxy', 'MCP_TOKEN', 'OPENAI_API_KEY', 'LEXORA_BUDDY_HOME', 'PI_CODING_AGENT_DIR', 'PI_TOOLS_DIR']

server.registerTool('runtime', { inputSchema: {} }, async () => ({
  content: [{
    type: 'text',
    text: JSON.stringify({
      argv: process.argv.slice(2),
      cwd: process.cwd(),
      environment: Object.fromEntries(environmentKeys.map(key => [key, process.env[key] ?? null])),
      pid: process.pid,
    }),
  }],
}))

server.registerTool('echo', { inputSchema: { text: z.string() } }, async ({ text }) => ({
  content: [{ type: 'text', text }],
}))

server.registerTool('stderr', { inputSchema: {} }, async () => {
  const chunk = Buffer.alloc(64 * 1024, 'x')
  for (let index = 0; index < 64; index += 1) {
    await new Promise((resolve, reject) => {
      process.stderr.write(chunk, error => error ? reject(error) : resolve())
    })
  }
  return { content: [{ type: 'text', text: 'stderr complete' }] }
})

server.registerTool('hold', { inputSchema: {} }, async (_input, { signal }) => {
  await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
  return { content: [{ type: 'text', text: 'cancelled' }] }
})

process.stdin.on('end', () => setTimeout(() => process.exit(0), 150))
const pidFile = process.argv.find(argument => argument.startsWith('--pid-file='))?.slice('--pid-file='.length)
if (pidFile)
  await writeFile(pidFile, String(process.pid))
if (process.argv.includes('--fail-handshake')) {
  server.server.setRequestHandler(InitializeRequestSchema, async () => ({
    protocolVersion: 'unsupported-fixture-version',
    capabilities: {},
    serverInfo: { name: 'fixture', version: '1.0.0' },
  }))
}
await server.connect(new StdioServerTransport())
