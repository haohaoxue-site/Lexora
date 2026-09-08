import { deferred } from '@buddy-tests/deferred'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { McpClientSession } from '../McpClientSession'

const sdk = vi.hoisted(() => ({
  connect: vi.fn<() => Promise<void>>(),
  instances: [] as Array<{
    close: ReturnType<typeof vi.fn>
    onclose?: () => void
  }>,
}))

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    close = vi.fn(async () => {})
    onclose?: () => void
    onerror?: () => void

    constructor() {
      sdk.instances.push(this)
    }

    connect(): Promise<void> {
      return sdk.connect()
    }

    listTools(): Promise<{ tools: [] }> {
      return Promise.resolve({ tools: [] })
    }

    callTool(): Promise<{ content: [] }> {
      return Promise.resolve({ content: [] })
    }
  },
}))

beforeEach(() => {
  sdk.instances.splice(0)
  sdk.connect.mockReset().mockResolvedValue()
})

describe('mcpClientSession', () => {
  it('shares one in-flight client connection across concurrent callers', async () => {
    const gate = deferred<void>()
    sdk.connect.mockImplementation(() => gate.promise)
    const session = createSession()

    const first = session.connect()
    const second = session.connect()
    await vi.waitUntil(() => sdk.instances.length > 0)

    expect(sdk.instances).toHaveLength(1)
    gate.resolve()
    await Promise.all([first, second])
    await session.close()
  })

  it('ignores a stale client close after a replacement is connected', async () => {
    const session = createSession()
    await session.connect()
    const first = sdk.instances[0]!
    first.onclose?.()
    await session.connect()
    expect(sdk.instances).toHaveLength(2)

    first.onclose?.()
    await session.listTools()

    expect(sdk.instances).toHaveLength(2)
    await session.close()
  })
})

function createSession(): McpClientSession {
  return new McpClientSession({
    config: {
      args: [],
      command: process.execPath,
      credentialRef: null,
      cwd: null,
      enabled: true,
      id: 'fixture',
      name: 'Fixture',
      transport: 'stdio',
    },
    credential: null,
  })
}
