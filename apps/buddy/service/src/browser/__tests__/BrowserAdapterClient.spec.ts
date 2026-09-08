import type { Server, Socket } from 'node:net'
import type { BrowserObservation } from '../../../../shared/browser'
import type { BrowserAdapterRequest, BrowserAdapterResponse } from '../../../../shared/browser/browserAdapterProtocol'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BrowserAdapterClient,
  BrowserAdapterClientError,
} from '../BrowserAdapterClient'

const SESSION_ID = '6f828cc1-6549-4245-b26e-43b2917c9281'
const PAGE_ID = 'ed312709-baf9-44b3-a292-108055838477'
const OBSERVATION_ID = 'b3a5d63b-17b7-4b5a-863a-37f135e297d4'
const TOKEN = 'a'.repeat(64)

const READY_STATE = {
  canGoBack: false,
  canGoForward: false,
  controller: 'human',
  controlEpoch: 0,
  conversationId: 'conversation-1',
  error: null,
  pageId: PAGE_ID,
  profileMode: 'default',
  security: { kind: 'secure', origin: 'https://example.com' },
  sessionId: SESSION_ID,
  status: 'ready',
  title: 'Example',
  url: 'https://example.com/docs',
  visible: true,
} as const

const OBSERVATION: BrowserObservation = {
  documentRevision: 1,
  elements: [],
  observationId: OBSERVATION_ID,
  pageId: PAGE_ID,
  sessionId: SESSION_ID,
  status: 'ready',
  title: 'Example',
  truncated: false,
  url: 'https://example.com/docs',
}

const temporaryDirectories: string[] = []
const servers: Server[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve) => {
    server.close(() => resolve())
  })))
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, {
    force: true,
    recursive: true,
  })))
})

describe('browserAdapterClient', () => {
  it('maps state, snapshot, action, and close over strict NDJSON requests', async () => {
    const requests: BrowserAdapterRequest[] = []
    const fixture = await createAdapterFixture((request) => {
      requests.push(request)
      switch (request.method) {
        case 'state': return success(request.id, { kind: 'state', state: READY_STATE })
        case 'snapshot': return success(request.id, {
          kind: 'snapshot',
          observation: OBSERVATION,
        })
        case 'action': return success(request.id, {
          actionKind: request.params.action.kind,
          kind: 'action',
          observation: OBSERVATION,
          state: READY_STATE,
        })
        case 'close': return success(request.id, { kind: 'close', revoked: true })
      }
    })
    const client = new BrowserAdapterClient(createLease(fixture.socketPath), {
      createRequestId: (() => {
        let id = 0
        return () => `request-${++id}`
      })(),
    })

    await expect(client.state()).resolves.toEqual(READY_STATE)
    await expect(client.snapshot({ maxElements: 80 })).resolves.toEqual(OBSERVATION)
    await expect(client.action({
      action: { amount: 'half-page', direction: 'down', kind: 'scroll' },
      documentRevision: 1,
      observationId: OBSERVATION_ID,
      pageId: PAGE_ID,
    })).resolves.toEqual({
      actionKind: 'scroll',
      observation: OBSERVATION,
      state: READY_STATE,
    })
    await expect(client.close()).resolves.toBeUndefined()

    expect(requests.map(request => request.method)).toEqual([
      'state',
      'snapshot',
      'action',
      'close',
    ])
    expect(requests.every(request => request.token === TOKEN)).toBe(true)
    await expect(client.state()).rejects.toMatchObject({
      code: 'BROWSER_ADAPTER_AUTH_FAILED',
    })
  })

  it('surfaces stable server failures without response diagnostics', async () => {
    const fixture = await createAdapterFixture(request => ({
      error: {
        code: 'BROWSER_ADAPTER_APPROVAL_REQUIRED',
        recovery: 'request_buddy_approval',
      },
      id: request.id,
      ok: false,
      protocolVersion: 1,
    }))
    const client = new BrowserAdapterClient(createLease(fixture.socketPath))

    const error = await client.action({
      action: { kind: 'click', ref: 'e1' },
      documentRevision: 1,
      frameId: 'main-frame',
      observationId: OBSERVATION_ID,
      pageId: PAGE_ID,
    }).catch(value => value)

    expect(error).toBeInstanceOf(BrowserAdapterClientError)
    expect(error).toMatchObject({
      code: 'BROWSER_ADAPTER_APPROVAL_REQUIRED',
      message: 'BROWSER_ADAPTER_APPROVAL_REQUIRED',
      recovery: 'request_buddy_approval',
    })
  })

  it('rejects a response with a different request id', async () => {
    const fixture = await createAdapterFixture(() => success(
      'different-request',
      { kind: 'state', state: READY_STATE },
    ))
    const client = new BrowserAdapterClient(createLease(fixture.socketPath))

    await expect(client.state()).rejects.toMatchObject({
      code: 'BROWSER_ADAPTER_REQUEST_INVALID',
    })
  })
})

function createLease(socketPath: string) {
  return {
    conversationId: 'conversation-1',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    pageId: PAGE_ID,
    protocolVersion: 1 as const,
    sessionId: SESSION_ID,
    socketPath,
    token: TOKEN,
  }
}

function success(
  id: string,
  result: Extract<BrowserAdapterResponse, { ok: true }>['result'],
): BrowserAdapterResponse {
  return {
    id,
    ok: true,
    protocolVersion: 1,
    result,
  }
}

async function createAdapterFixture(
  respond: (request: BrowserAdapterRequest) => BrowserAdapterResponse,
): Promise<{ socketPath: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'buddy-browser-adapter-client-'))
  temporaryDirectories.push(directory)
  const socketPath = join(directory, 'adapter.sock')
  const server = createServer(socket => readRequest(socket, respond))
  servers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(socketPath, resolve)
  })
  return { socketPath }
}

function readRequest(
  socket: Socket,
  respond: (request: BrowserAdapterRequest) => BrowserAdapterResponse,
): void {
  socket.setEncoding('utf8')
  let buffer = ''
  socket.on('data', (chunk: string) => {
    buffer += chunk
    const newline = buffer.indexOf('\n')
    if (newline < 0)
      return
    const request = JSON.parse(buffer.slice(0, newline)) as BrowserAdapterRequest
    socket.end(`${JSON.stringify(respond(request))}\n`)
  })
}
