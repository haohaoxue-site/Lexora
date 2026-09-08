import type { Api, AssistantMessage, Context, Model } from '@earendil-works/pi-ai'
import type { BuddyInProcessExtension } from '../../createBuddyResourceLoader'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAssistantMessageEventStream, InMemoryCredentialStore } from '@earendil-works/pi-ai'
import { ModelRuntime } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEstimatedContextUsage } from '../../contextUsageBreakdown'
import { createBuddyContextSnapshot, createBuddySession } from '../../createBuddySession'
import { createToolPolicyExtension } from '../../hooks/toolPolicyExtension'
import { createToolDiscoveryCapability } from '../toolDiscoveryExtension'

const roots: string[] = []
const name = 'lexora_sample_save'
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'buddy-discovery-')))
  roots.push(root)
  const runtime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false })
  const model = runtime.getModels()[0]!
  await runtime.setRuntimeApiKey(model.provider, 'offline-test-only')
  const extension: BuddyInProcessExtension = {
    name: 'lexora-sample',
    factory(pi) {
      pi.registerTool({
        name,
        label: 'Save sample',
        description: 'Save a sample',
        parameters: Type.Object({ text: Type.String() }),
        promptGuidelines: ['DISCLOSED_SAMPLE_GUIDELINE'],
        async execute(_id, input) {
          await writeFile(join(root, 'result.txt'), input.text)
          return { content: [{ type: 'text', text: 'Saved sample' }], details: {} }
        },
      })
    },
  }
  const discovery = createToolDiscoveryCapability([{ group: 'system', toolNames: [name], keywords: 'sample 保存' }])
  const options = {
    agentDir: join(root, 'agent'),
    branchId: 'branch-1',
    canonicalRoot: root,
    conversationId: 'conversation-1',
    conversationsDirectory: join(root, 'conversations'),
    cwd: root,
    approvalPolicy: 'policy' as const,
    executionProfile: 'workspace_write' as const,
    model,
    modelRuntime: runtime,
    inProcessExtensions: [extension, discovery.extension],
    resources: { approvedSkillPaths: [], context: { agentsFiles: [], diagnostics: [] }, directoryContext: '', revision: 'empty' },
  }
  return { root, options, runtime, model }
}

function response(model: Model<Api>, calls: { name: string, arguments: Record<string, unknown> }[] = []) {
  const message: AssistantMessage = {
    api: model.api,
    model: model.id,
    provider: model.provider,
    role: 'assistant',
    timestamp: Date.now(),
    stopReason: calls.length ? 'toolUse' : 'stop',
    content: calls.length ? calls.map((call, index) => ({ ...call, type: 'toolCall', id: `${call.name}-${index}-${Date.now()}` })) : [{ type: 'text', text: 'Done' }],
    usage: { input: 10, output: 10, totalTokens: 20, cacheRead: 0, cacheWrite: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  }
  const stream = createAssistantMessageEventStream()
  queueMicrotask(() => stream.push({ type: 'done', reason: calls.length ? 'toolUse' : 'stop', message }))
  return stream
}

describe('real Pi tool discovery loop', () => {
  it.each(['approved_once', 'denied'] as const)('preserves original approval and filesystem effects after discovery: %s', async (decision) => {
    const { root, options, runtime } = await fixture()
    const approvals: { toolName: string, arguments: unknown }[] = []
    const authorized: string[] = []
    const policy = createToolPolicyExtension({
      approvalAvailable: true,
      approvalPolicy: 'policy',
      executionProfile: 'full_access',
      cwd: root,
      owner: { id: 'conversation-1', kind: 'conversation' },
      getGrants: () => [],
      getRunContext: () => ({
        runId: 'run-1',
        signal: new AbortController().signal,
        flushProjectedEvents: async () => {},
        onToolExecutionAuthorized: async (event) => { authorized.push(event.toolName) },
      }),
      classifyTool: event => event.toolName === name
        ? { access: 'write', paths: [{ path: join(root, 'result.txt'), mode: 'create' }], forceAsk: true }
        : { access: 'read', paths: [] },
      approvalService: { request: async (input) => {
        approvals.push({ toolName: input.toolName, arguments: input.arguments })
        await expect(readFile(join(root, 'result.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
        return { approvalId: 'approval-1', decision }
      } },
    })
    let request = 0
    vi.spyOn(runtime, 'streamSimple').mockImplementation((model) => {
      request += 1
      if (request === 1)
        return response(model, [{ name: 'lexora_tool_search', arguments: { toolNames: [name] } }])
      if (request === 2)
        return response(model, [{ name, arguments: { text: 'Approved output' } }])
      return response(model)
    })
    const created = await createBuddySession({ ...options, inProcessExtensions: [...options.inProcessExtensions, policy] })
    try {
      await created.session.prompt('Discover and save with original approval')
      expect(approvals).toEqual([{ toolName: name, arguments: { text: 'Approved output' } }])
      if (decision === 'approved_once') {
        expect(await readFile(join(root, 'result.txt'), 'utf8')).toBe('Approved output')
        expect(authorized).toEqual(['lexora_tool_search', name])
      }
      else {
        await expect(readFile(join(root, 'result.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
        expect(authorized).toEqual(['lexora_tool_search'])
        expect(JSON.stringify(created.session.messages)).toContain('APPROVAL_DENIED')
      }
    }
    finally {
      await created.shutdown('quit')
    }
  })

  it('recomputes disclosure from compacted context and ignores names in the summary', async () => {
    const { options, runtime } = await fixture()
    let request = 0
    vi.spyOn(runtime, 'streamSimple').mockImplementation((model) => {
      request += 1
      return response(model, request === 1 ? [{ name: 'lexora_tool_search', arguments: { toolNames: [name] } }] : [])
    })
    const created = await createBuddySession(options)
    try {
      await created.session.prompt('Discover sample')
      expect(created.session.getActiveToolNames()).toContain(name)
      const manager = created.session.sessionManager
      const kept = manager.appendMessage({ role: 'user', content: 'Continue without earlier tool results', timestamp: Date.now() })
      const id = manager.appendCompaction(`Earlier work mentioned ${name}`, kept, 500)
      const entry = manager.getEntry(id)
      if (entry?.type !== 'compaction')
        throw new Error('Expected committed compaction')
      created.session.agent.state.messages = manager.buildSessionContext().messages
      await created.session.extensionRunner?.emit({ type: 'session_compact', compactionEntry: entry, fromExtension: false, reason: 'manual', willRetry: false })
      expect(created.session.getActiveToolNames()).not.toContain(name)
    }
    finally {
      await created.shutdown('quit')
    }
    const resumed = await createBuddySession({ ...options, piSessionFile: created.piSessionFile })
    try {
      expect(resumed.session.getActiveToolNames()).not.toContain(name)
    }
    finally {
      await resumed.shutdown('quit')
    }
  })

  it('does not restore discovery from another leaf of the same session file', async () => {
    const { options, runtime } = await fixture()
    let request = 0
    vi.spyOn(runtime, 'streamSimple').mockImplementation((model) => {
      request += 1
      return response(model, request === 1 ? [{ name: 'lexora_tool_search', arguments: { toolNames: [name] } }] : [])
    })
    const created = await createBuddySession(options)
    try {
      await created.session.prompt('Discover sample')
      const manager = created.session.sessionManager
      const beforeDiscovery = manager.getBranch().find(entry => entry.type === 'message' && entry.message.role === 'user')!
      manager.branch(beforeDiscovery.id)
      manager.appendMessage({ role: 'user', content: 'New branch without discovery', timestamp: Date.now() })
      expect(await readFile(created.piSessionFile, 'utf8')).toContain(name)
    }
    finally {
      await created.shutdown('quit')
    }
    const resumed = await createBuddySession({ ...options, piSessionFile: created.piSessionFile })
    try {
      expect(resumed.session.getActiveToolNames()).not.toContain(name)
    }
    finally {
      await resumed.shutdown('quit')
    }
  })

  it('refreshes schemas and guidelines together, executes the original tool and restores preview state', async () => {
    const { root, options, runtime } = await fixture()
    const requests: Context[] = []
    vi.spyOn(runtime, 'streamSimple').mockImplementation((model, context) => {
      requests.push(structuredClone({ ...context, tools: context.tools?.map(tool => ({ name: tool.name, description: tool.description, parameters: tool.parameters })) }))
      if (requests.length === 1)
        return response(model, [{ name: 'lexora_tool_search', arguments: { toolNames: [name] } }])
      if (requests.length === 2)
        return response(model, [{ name, arguments: { text: 'Original tool execution' } }])
      return response(model)
    })
    const initialPreview = await createBuddyContextSnapshot(options)
    const created = await createBuddySession(options)
    try {
      await created.session.prompt('Save the sample')
      expect(requests[0]?.tools?.map(tool => tool.name)).not.toContain(name)
      expect(requests[0]?.systemPrompt).not.toContain('DISCLOSED_SAMPLE_GUIDELINE')
      expect(requests[1]?.tools?.filter(tool => tool.name === name)).toHaveLength(1)
      expect(requests[1]?.systemPrompt).toContain('DISCLOSED_SAMPLE_GUIDELINE')
      expect(await readFile(join(root, 'result.txt'), 'utf8')).toBe('Original tool execution')
      const initial = createEstimatedContextUsage({ ...requests[0]!, messages: [] })
      expect(initialPreview).toEqual(initial)
      const resumedPreview = await createBuddyContextSnapshot({ ...options, piSessionFile: created.piSessionFile })
      expect(resumedPreview?.toolTokens).toBe(createEstimatedContextUsage(requests[1]!).toolTokens)
    }
    finally {
      await created.shutdown('quit')
    }
    const resumed = await createBuddySession({ ...options, piSessionFile: created.piSessionFile })
    try {
      expect(resumed.session.getActiveToolNames()).toContain(name)
    }
    finally {
      await resumed.shutdown('quit')
    }
  })

  it('does not allow a hidden tool in the same batch as search', async () => {
    const { root, options, runtime } = await fixture()
    let request = 0
    vi.spyOn(runtime, 'streamSimple').mockImplementation((model) => {
      request += 1
      if (request === 1)
        return response(model, [{ name: 'lexora_tool_search', arguments: { toolNames: [name] } }, { name, arguments: { text: 'Must not execute' } }])
      return response(model)
    })
    const created = await createBuddySession(options)
    try {
      await created.session.prompt('Search and try hidden tool in same response')
      expect(created.session.messages.some(message => message.role === 'toolResult' && message.toolName === name && message.isError)).toBe(true)
      await expect(readFile(join(root, 'result.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
    }
    finally {
      await created.shutdown('quit')
    }
  })
})
