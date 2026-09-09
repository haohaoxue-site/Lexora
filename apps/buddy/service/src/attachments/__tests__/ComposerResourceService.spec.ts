import type { DatabaseSync } from 'node:sqlite'
import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BUDDY_ATTACHMENT_COUNT_LIMIT } from '../../../../shared/conversation/attachmentPolicy'
import { createBuddyUserContent } from '../../../../shared/conversation/buddyUserContent'
import { ArtifactService } from '../../artifacts/ArtifactService'
import { ChatTurnService } from '../../chat/ChatTurnService'
import { SpaceService } from '../../spaces/SpaceService'
import { createArtifactRepository } from '../../storage/artifactRepository'
import { createAttachmentRepository } from '../../storage/attachmentRepository'
import { BuddyDataPaths } from '../../storage/BuddyDataPaths'
import { createComposerDraftRepository } from '../../storage/composerDraftRepository'
import { createComposerResourceRepository } from '../../storage/composerResourceRepository'
import { createConversationDirectoryGrantRepository } from '../../storage/conversationDirectoryGrantRepository'
import { createConversationRepository } from '../../storage/conversationRepository'
import { openBuddyDatabase } from '../../storage/database'
import { createRunInputRepository } from '../../storage/runInputRepository'
import { createRunRepository } from '../../storage/runRepository'
import { createSpaceRepository } from '../../storage/spaceRepository'
import { createTurnRequestRepository } from '../../storage/turnRequestRepository'
import { normalizeComposerWorkspace } from '../../workspace/normalizeComposerWorkspace'
import { AttachmentService } from '../AttachmentService'
import { ComposerResourceService } from '../ComposerResourceService'

const databases: DatabaseSync[] = []
const directories: string[] = []
afterEach(async () => {
  databases.splice(0).forEach(database => database.close())
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'buddy-composer-resource-'))
  directories.push(root)
  const database = openBuddyDatabase({ databasePath: ':memory:' })
  databases.push(database)
  const paths = new BuddyDataPaths(root)
  const repository = createComposerResourceRepository(database)
  const attachmentRepository = createAttachmentRepository(database)
  const attachments = new AttachmentService({ paths, repository: attachmentRepository })
  const drafts = createComposerDraftRepository(database)
  const spaces = createSpaceRepository(database)
  const conversations = createConversationRepository(database)
  const conversationGrants = createConversationDirectoryGrantRepository(database)
  const artifacts = new ArtifactService({ repository: createArtifactRepository(database) })
  const events: Array<{ createdAt: string, payload: unknown, runId: string, sequence: number, type: string }> = []
  return {
    artifacts,
    attachments,
    attachmentRepository,
    conversations,
    conversationGrants,
    database,
    drafts,
    events,
    paths,
    repository,
    root,
    service: new ComposerResourceService({
      artifacts,
      attachments,
      conversationGrants,
      conversations,
      drafts,
      eventLog: { listForRuns: runIds => events.filter(event => runIds.includes(event.runId)) as never },
      repository,
      spaceFiles: new SpaceService(spaces),
      spaces,
    }),
    spaces,
  }
}

function imageBytes() {
  return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAFElEQVR4AQEJAPb/AP8AAP8AAP//D/kD/aYucFEAAAAASUVORK5CYII=', 'base64')
}

describe('composer resource import', () => {
  it('keeps legacy message attachments and granted Artifacts available without creating a Space', async () => {
    const fixture = await setup()
    const workspace = join(fixture.root, 'conversation-workspace')
    await mkdir(workspace)
    fixture.conversations.create({
      approvalPolicy: 'policy',
      branchId: 'branch-1',
      createdAt: '2026-09-06T00:00:00.000Z',
      executionProfile: 'workspace_write',
      id: 'conversation-1',
      spaceId: null,
      title: 'Sources without Space',
    })
    fixture.conversationGrants.grant({
      canonicalRoot: workspace,
      conversationId: 'conversation-1',
      createdAt: '2026-09-06T00:00:00.000Z',
      id: 'conversation-grant-1',
      root: workspace,
    })
    fixture.conversations.createMessage({
      branchId: 'branch-1',
      content: {
        attachmentIds: ['attachment-history'],
        text: 'legacy attachment message',
      },
      conversationId: 'conversation-1',
      createdAt: '2026-09-06T00:01:00.000Z',
      id: 'message-1',
      role: 'user',
      runId: 'run-1',
    })
    const historyPath = join(fixture.root, 'history.txt')
    await writeFile(historyPath, 'history')
    fixture.attachmentRepository.create({
      conversationId: 'conversation-1',
      createdAt: '2026-09-06T00:01:00.000Z',
      draftId: null,
      id: 'attachment-history',
      messageId: 'message-1',
      mimeType: 'text/plain',
      name: 'history.txt',
      sizeBytes: 7,
      storedPath: historyPath,
    })
    const artifactPath = join(workspace, 'artifact.txt')
    await writeFile(artifactPath, 'artifact')
    const [artifact] = await fixture.artifacts.presentOutputs({
      conversationId: 'conversation-1',
      cwd: workspace,
      grants: [{ canonicalRoot: workspace, grantId: 'conversation-grant-1', kind: 'workspace', root: workspace }],
      paths: [artifactPath],
    })
    fixture.events.push({
      createdAt: '2026-09-06T00:02:00.000Z',
      payload: { artifactIds: [artifact!.id], sourceToolCallId: 'tool-1', sourceToolName: 'output_present' },
      runId: 'run-1',
      sequence: 1,
      type: 'output.produced',
    })

    const catalog = await fixture.service.listSources({
      branchId: 'branch-1',
      conversationId: 'conversation-1',
      draftId: 'draft-1',
      query: '',
      spaceId: null,
    })

    expect(new Set(catalog.files.map(item => item.category))).toEqual(new Set(['history', 'artifact']))
    const history = catalog.files.find(item => item.category === 'history')!
    expect(history.source).toMatchObject({
      attachmentId: 'attachment-history',
      messageId: 'message-1',
    })
    const selectedHistory = await fixture.service.selectSource({
      draftId: 'draft-1',
      resourceId: 'history-resource',
      source: history.source,
    })
    await expect(fixture.service.resolveInput(
      'draft-1',
      { ...createBuddyUserContent(), panelResourceIds: [selectedHistory.resourceId] },
      { branchId: 'branch-1', conversationId: 'conversation-1', spaceId: null },
    )).resolves.toEqual([{
      attachmentId: 'attachment-history',
      resourceId: selectedHistory.resourceId,
    }])
    expect(fixture.database.prepare('SELECT count(*) AS count FROM spaces').get()).toEqual({ count: 0 })
    fixture.conversationGrants.revokeAll('conversation-1', '2026-09-06T00:03:00.000Z')
    const afterRevocation = await fixture.service.listSources({
      branchId: 'branch-1',
      conversationId: 'conversation-1',
      draftId: 'draft-1',
      query: '',
      spaceId: null,
    })
    expect(afterRevocation.files.map(item => item.category)).toEqual(['history'])
  })

  it('keeps conversation-owned Artifacts available without a Space or an additional directory grant', async () => {
    const fixture = await setup()
    const workspace = join(fixture.root, 'conversation-workspace')
    await mkdir(workspace)
    fixture.conversations.create({
      approvalPolicy: 'policy',
      branchId: 'branch-1',
      createdAt: '2026-09-06T00:00:00.000Z',
      executionProfile: 'workspace_write',
      id: 'conversation-1',
      spaceId: null,
      title: 'Conversation output',
    })
    fixture.conversations.createMessage({
      branchId: 'branch-1',
      content: { text: 'generated output' },
      conversationId: 'conversation-1',
      createdAt: '2026-09-06T00:01:00.000Z',
      id: 'message-1',
      role: 'assistant',
      runId: 'run-1',
    })
    const artifactPath = join(workspace, 'artifact.txt')
    await writeFile(artifactPath, 'artifact')
    const [artifact] = await fixture.artifacts.presentOutputs({
      conversationId: 'conversation-1',
      cwd: workspace,
      grants: [{ canonicalRoot: workspace, grantId: 'conversation-1', kind: 'workspace', root: workspace }],
      paths: [artifactPath],
    })
    fixture.events.push({
      createdAt: '2026-09-06T00:02:00.000Z',
      payload: { artifactIds: [artifact!.id], sourceToolCallId: 'tool-1', sourceToolName: 'output_present' },
      runId: 'run-1',
      sequence: 1,
      type: 'output.produced',
    })

    const catalog = await fixture.service.listSources({
      branchId: 'branch-1',
      conversationId: 'conversation-1',
      draftId: 'draft-1',
      query: '',
      spaceId: null,
    })

    const artifactOption = catalog.files.find(item => item.category === 'artifact')
    expect(artifactOption).toMatchObject({
      label: 'artifact.txt',
      source: { artifactId: artifact!.id, conversationId: 'conversation-1' },
    })
    const selected = await fixture.service.selectSource({
      draftId: 'draft-1',
      resourceId: 'artifact-resource',
      source: artifactOption!.source,
    })
    const input = await fixture.service.resolveInput(
      'draft-1',
      { ...createBuddyUserContent(), panelResourceIds: [selected.resourceId] },
      { branchId: 'branch-1', conversationId: 'conversation-1', spaceId: null },
    )
    expect(await readFile(fixture.attachmentRepository.findById(input[0]!.attachmentId)!.storedPath, 'utf8')).toBe('artifact')
  })

  it('lists visible lineage sources, reuses message bytes, and freezes the current Artifact at send', async () => {
    const fixture = await setup()
    const workspace = join(fixture.root, 'workspace')
    await mkdir(workspace)
    await writeFile(join(workspace, 'space.txt'), 'space')
    fixture.spaces.create({
      id: 'space-1',
      name: 'Workspace',
      memoryScope: 'personal_and_space',
      createdAt: '2026-09-06T00:00:00.000Z',
      additionalDirectories: [],
      primaryDirectory: { id: 'binding-1', root: workspace, canonicalRoot: workspace, accessGrantedAt: 'now', resourcesTrustedAt: 'now' },
    })
    fixture.conversations.create({
      approvalPolicy: 'policy',
      branchId: 'branch-1',
      createdAt: '2026-09-06T00:00:00.000Z',
      executionProfile: 'workspace_write',
      id: 'conversation-1',
      spaceId: 'space-1',
      title: 'Sources',
    })
    const messageContent = {
      resourceSnapshots: [{ attachmentId: 'attachment-history', resourceId: 'history-snapshot' }],
      userContent: { ...createBuddyUserContent(), panelResourceIds: ['history-snapshot'] },
    }
    fixture.conversations.createMessage({
      branchId: 'branch-1',
      content: messageContent,
      conversationId: 'conversation-1',
      createdAt: '2026-09-06T00:01:00.000Z',
      id: 'message-1',
      role: 'user',
      runId: 'run-1',
    })
    const historyPath = join(fixture.root, 'history.txt')
    await writeFile(historyPath, 'immutable')
    fixture.attachmentRepository.create({
      conversationId: 'conversation-1',
      createdAt: '2026-09-06T00:01:00.000Z',
      draftId: null,
      id: 'attachment-history',
      messageId: 'message-1',
      mimeType: 'text/plain',
      name: 'history.txt',
      sizeBytes: 9,
      storedPath: historyPath,
    })
    const artifactPath = join(workspace, 'artifact.txt')
    await writeFile(artifactPath, 'before')
    const [artifact] = await fixture.artifacts.presentOutputs({
      conversationId: 'conversation-1',
      cwd: workspace,
      grants: [{ canonicalRoot: workspace, grantId: 'binding-1', kind: 'workspace', root: workspace }],
      paths: [artifactPath],
    })
    fixture.events.push({
      createdAt: '2026-09-06T00:02:00.000Z',
      payload: { artifactIds: [artifact!.id], sourceToolCallId: 'tool-1', sourceToolName: 'output_present' },
      runId: 'run-1',
      sequence: 1,
      type: 'output.produced',
    })
    const scope = { branchId: 'branch-1', conversationId: 'conversation-1', spaceId: 'space-1' }
    const catalog = await fixture.service.listSources({ ...scope, draftId: 'draft-1', query: '' })
    expect(new Set(catalog.files.map(item => item.category))).toEqual(new Set(['space', 'history', 'artifact']))

    const history = catalog.files.find(item => item.category === 'history')!
    const firstHistory = await fixture.service.selectSource({ draftId: 'draft-1', resourceId: 'history-1', source: history.source })
    expect(await fixture.service.selectSource({ draftId: 'draft-1', resourceId: 'history-2', source: history.source })).toEqual(firstHistory)
    const historyInput = await fixture.service.resolveInput('draft-1', { ...createBuddyUserContent(), panelResourceIds: [firstHistory.resourceId] }, scope)
    expect(historyInput).toEqual([{ attachmentId: 'attachment-history', resourceId: firstHistory.resourceId }])

    const artifactOption = catalog.files.find(item => item.category === 'artifact')!
    const artifactResource = await fixture.service.selectSource({ draftId: 'draft-1', resourceId: 'artifact-1', source: artifactOption.source })
    await writeFile(artifactPath, 'at send')
    const artifactInput = await fixture.service.resolveInput('draft-1', { ...createBuddyUserContent(), panelResourceIds: [artifactResource.resourceId] }, scope)
    expect(await readFile(fixture.attachmentRepository.findById(artifactInput[0]!.attachmentId)!.storedPath, 'utf8')).toBe('at send')
    await writeFile(artifactPath, 'later')
    expect(await readFile(fixture.attachmentRepository.findById(artifactInput[0]!.attachmentId)!.storedPath, 'utf8')).toBe('at send')
    await expect(fixture.service.selectSource({
      draftId: 'draft-1',
      resourceId: 'hidden',
      source: { ...history.source, branchId: 'hidden-branch' },
    })).rejects.toBeInstanceOf(Error)
  })

  it('keeps Space references live until send and reuses the catalog origin without rereading a frozen message', async () => {
    const { service, root, spaces, attachmentRepository, database, drafts } = await setup()
    const directory = join(root, 'workspace')
    await mkdir(directory)
    await writeFile(join(directory, 'note.txt'), 'before')
    spaces.create({
      id: 'space-1',
      name: 'Workspace',
      memoryScope: 'personal_and_space',
      createdAt: new Date().toISOString(),
      additionalDirectories: [],
      primaryDirectory: { id: 'binding-1', root: directory, canonicalRoot: directory, accessGrantedAt: 'now', resourcesTrustedAt: 'now' },
    })
    const input = { draftId: 'draft-1', resourceId: 'resource-1', source: { spaceId: 'space-1', bindingId: 'binding-1', relativePath: 'note.txt' } }
    const selected = await service.selectSpaceFile(input)
    expect(selected).toMatchObject({ resourceId: 'resource-1', state: 'ready', source: { ...input.source, bindingRevision: 1 } })
    expect(await service.selectSpaceFile(input)).toEqual(selected)
    expect(await service.selectSpaceFile({ ...input, resourceId: 'resource-duplicate' })).toEqual(selected)
    expect(database.prepare('SELECT count(*) AS count FROM attachments').get()).toEqual({ count: 0 })
    const content = { ...createBuddyUserContent(), panelResourceIds: ['resource-1'] }
    drafts.open({
      draftId: 'draft-1',
      initialContent: content,
      initialExecutionConfig: { approvalPolicy: 'policy', executionProfile: 'workspace_write' },
      initialModelSelection: null,
      now: new Date().toISOString(),
      scope: { kind: 'global' },
    })
    await service.cleanupDrafts(new Date('2099-01-01').getTime())
    expect(service.list('draft-1')).toContainEqual(selected)
    await writeFile(join(directory, 'note.txt'), 'at send')
    const frozen = await service.resolveInput('draft-1', content, { branchId: null, conversationId: null, spaceId: 'space-1' })
    const snapshot = attachmentRepository.findById(frozen[0]!.attachmentId)!
    expect(await readFile(snapshot.storedPath, 'utf8')).toBe('at send')
    await writeFile(join(directory, 'note.txt'), 'later')
    expect(await readFile(snapshot.storedPath, 'utf8')).toBe('at send')
    expect((await service.resolveInput('draft-1', content, { branchId: null, conversationId: null, spaceId: 'space-1' }))[0]!.attachmentId).not.toBe(snapshot.id)
    await expect(service.resolveInput('draft-1', content)).rejects.toMatchObject({ code: 'DIRECTORY_NOT_AUTHORIZED' })
    const legacy = { drafts: [{ draftId: 'draft-1', targetKey: 'space:space-1', content: '$writer @note.txt', composerContent: { type: 'doc', attrs: { panelResourceIds: [] }, content: [{ type: 'paragraph', content: [
      { type: 'chatPromptToken', attrs: { kind: 'skill', value: 'writer' } },
      { type: 'text', text: ' ' },
      { type: 'chatPromptToken', attrs: { kind: 'file', value: join(directory, 'note.txt') } },
      { type: 'chatResourceReference', attrs: { resourceId: 'resource-1' } },
    ] }] } }] }
    const normalized = await normalizeComposerWorkspace(legacy, { resources: service, conversations: createConversationRepository(database) })
    expect(normalized).toMatchObject({ drafts: [{ composerContent: { content: [{ content: [
      { type: 'chatPromptDirective', attrs: { directive: 'skill', value: 'writer' } },
      { type: 'text', text: ' ' },
      { type: 'chatResourceReference', attrs: { resourceId: 'resource-1' } },
      { type: 'chatResourceReference', attrs: { resourceId: 'resource-1' } },
    ] }] } }] })
    expect(legacy.drafts[0]!.composerContent.content[0]!.content[0]!.type).toBe('chatPromptToken')
    await writeFile(join(directory, '.env'), 'synthetic=value')
    await expect(service.selectSpaceFile({ ...input, resourceId: 'sensitive', source: { ...input.source, relativePath: '.env' } })).rejects.toMatchObject({ code: 'DIRECTORY_NOT_AUTHORIZED' })
    await writeFile(join(directory, 'note.txt'), Uint8Array.of(255))
    await expect(service.resolveInput('draft-1', content, { branchId: null, conversationId: null, spaceId: 'space-1' })).rejects.toBeInstanceOf(Error)
    await rm(join(directory, 'note.txt'))
    await writeFile(join(root, 'outside.txt'), 'outside')
    await symlink(join(root, 'outside.txt'), join(directory, 'note.txt'))
    await expect(service.resolveInput('draft-1', content, { branchId: null, conversationId: null, spaceId: 'space-1' })).rejects.toBeInstanceOf(Error)
  })

  it('sends a panel-only resource through the real turn transaction and replays the immutable input', async () => {
    const { service, attachments, database, attachmentRepository } = await setup()
    const conversations = createConversationRepository(database)
    const drafts = createComposerDraftRepository(database)
    const runs = createRunRepository(database)
    const runInputs = createRunInputRepository(database)
    let failNextLaunch = false
    const turns = new ChatTurnService({
      attachments,
      composerResources: service,
      conversations,
      drafts,
      runs,
      runInputs,
      turnRequests: createTurnRequestRepository(database),
      spaces: createSpaceRepository(database),
      conversationLifecycle: { isDeleting: () => false },
      skills: { materializeForSpace: async () => [{ name: 'writer', body: 'Use concise wording.', filePath: '/fixture/skills/writer/SKILL.md', baseDirectory: '/fixture/skills/writer' }] },
      runner: { cancel: async () => false },
      providers: {
        getDefaultModel: async () => ({ modelId: 'offline', providerId: 'fixture', reasoning: null, serviceTier: null }),
        executionModels: { resolveAvailable: async () => ({
          api: 'openai-completions',
          id: 'offline',
          name: 'Offline',
          provider: 'fixture',
          baseUrl: 'http://127.0.0.1:9',
          reasoning: false,
          input: ['text', 'image'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128000,
          maxTokens: 4096,
        }) },
      },
      turnLauncher: {
        launch: async (runId) => {
          if (failNextLaunch) {
            failNextLaunch = false
            runs.reconcileTerminal(runId, 'failed', new Date().toISOString(), 'AGENT_RUN_FAILED')
          }
          return { runId, completion: Promise.resolve(runs.findById(runId)!) }
        },
      },
    })
    const userContent = { ...createBuddyUserContent(), panelResourceIds: ['resource-1'] }
    const draft = drafts.open({
      draftId: 'draft-1',
      initialContent: userContent,
      initialExecutionConfig: {
        approvalPolicy: 'policy',
        executionProfile: 'workspace_write',
      },
      initialModelSelection: null,
      now: '2026-09-06T00:00:00.000Z',
      scope: { kind: 'global' },
    })
    service.accept({ draftId: 'draft-1', resources: [{ resourceId: 'resource-1', mimeType: 'text/plain', name: 'note.txt', sizeBytes: 3 }] })
    const request = {
      draftId: draft.draftId,
      expectedRevision: draft.revision,
      requestId: 'request-1',
    }
    await expect(turns.start(request)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    expect(database.prepare('SELECT count(*) AS count FROM messages').get()).toEqual({ count: 0 })
    const ready = await service.complete({ draftId: 'draft-1', resourceId: 'resource-1', bytes: new TextEncoder().encode('abc') })
    database.exec(`
      CREATE TRIGGER fail_precommit_run
      BEFORE INSERT ON runs
      BEGIN
        SELECT RAISE(ABORT, 'injected precommit failure');
      END;
    `)
    await expect(turns.start({ ...request, requestId: 'precommit-failure' })).rejects.toThrow(
      'injected precommit failure',
    )
    database.exec('DROP TRIGGER fail_precommit_run')
    expect(database.prepare('SELECT count(*) AS count FROM messages').get()).toEqual({ count: 0 })
    expect(database.prepare('SELECT count(*) AS count FROM runs').get()).toEqual({ count: 0 })
    expect(drafts.findById(draft.draftId)).toEqual(draft)
    expect(attachmentRepository.listAll()).toHaveLength(1)
    expect(await attachments.reconcileStorage()).toMatchObject({ removedOrphanFiles: 0 })
    const turn = await turns.start(request)
    expect(await turns.start(request)).toEqual(turn)
    expect(database.prepare('SELECT count(*) AS count FROM runs').get()).toEqual({ count: 1 })
    const message = conversations.listBranchMessages(turn.conversationId, turn.branchId)[0]!
    expect(message.content).toMatchObject({
      userContent,
      resourceSnapshots: [{ resourceId: 'resource-1', attachmentId: expect.any(String) }],
    })
    const stored = runInputs.findByRunId(turn.runId)!
    expect(stored.prompt).toBe('[FILE#1]\n\n[FILE#1] note.txt\nabc')
    expect(stored.attachmentIds).toHaveLength(1)
    const snapshot = attachmentRepository.findById(stored.attachmentIds[0]!)!
    expect(snapshot.messageId).toBe(message.id)
    expect(await readFile(snapshot.storedPath, 'utf8')).toBe('abc')
    expect(service.list('draft-1')).toEqual([ready])

    runs.reconcileTerminal(turn.runId, 'failed', new Date().toISOString(), 'RUNTIME_RESTARTED')
    const interrupted = await turns.start(request)
    expect(interrupted.runId).toBe(turn.runId)
    expect(interrupted.run.status).toBe('failed')
    expect(database.prepare('SELECT count(*) AS count FROM runs').get()).toEqual({ count: 1 })
    expect(database.prepare('SELECT count(*) AS count FROM messages').get()).toEqual({ count: 1 })

    const originalMessage = conversations.listBranchMessages(turn.conversationId, turn.branchId)[0]!
    const editDraft = drafts.open({
      draftId: 'message-edit-draft',
      initialContent: createBuddyUserContent(),
      initialExecutionConfig: {
        approvalPolicy: 'policy',
        executionProfile: 'workspace_write',
      },
      initialModelSelection: null,
      now: '2026-09-06T00:00:00.500Z',
      scope: {
        branchId: turn.branchId,
        conversationId: turn.conversationId,
        kind: 'message_edit',
        userMessageId: originalMessage.id,
      },
    })
    const editedResource = await service.selectSource({
      draftId: editDraft.draftId,
      resourceId: 'edited-resource',
      source: {
        attachmentId: snapshot.id,
        branchId: turn.branchId,
        conversationId: turn.conversationId,
        messageId: originalMessage.id,
      },
    })
    const editedContent = {
      ...createBuddyUserContent(),
      body: [{
        type: 'paragraph' as const,
        content: [
          { type: 'prompt_directive' as const, directive: 'slash_command' as const, commandMode: 'prompt' as const, value: '/plan' },
          { type: 'text' as const, text: ' revise with the snapshot' },
        ],
      }],
      panelResourceIds: [editedResource.resourceId],
    }
    const savedEditDraft = drafts.save({
      content: editedContent,
      draftId: editDraft.draftId,
      executionConfig: editDraft.executionConfig,
      expectedRevision: editDraft.revision,
      modelSelection: editDraft.modelSelection,
      now: '2026-09-06T00:00:00.600Z',
    })
    const editedTurn = await turns.editUserMessage({
      conversationId: turn.conversationId,
      draftId: savedEditDraft.draftId,
      expectedRevision: savedEditDraft.revision,
      requestId: 'edit-message-1',
      userMessageId: originalMessage.id,
    })
    expect(editedTurn.draftReceipt).toEqual({
      committedRevision: savedEditDraft.revision + 1,
      draftId: savedEditDraft.draftId,
      sourceRevision: savedEditDraft.revision,
    })
    const originalAfterEdit = conversations.listBranchMessages(turn.conversationId, turn.branchId)[0]!
    expect(originalAfterEdit.id).toBe(originalMessage.id)
    expect(originalAfterEdit.content).toEqual(originalMessage.content)
    const editedBranchMessage = conversations.listBranchMessages(turn.conversationId, editedTurn.branchId)[0]!
    expect(editedBranchMessage.id).not.toBe(originalMessage.id)
    expect(editedBranchMessage.content).toMatchObject({
      resourceSnapshots: [{ resourceId: 'edited-resource', attachmentId: expect.any(String) }],
      userContent: editedContent,
    })
    const editedAttachmentId = (editedBranchMessage.content as { resourceSnapshots: Array<{ attachmentId: string }> }).resourceSnapshots[0]!.attachmentId
    expect(editedAttachmentId).not.toBe((originalMessage.content as { resourceSnapshots: Array<{ attachmentId: string }> }).resourceSnapshots[0]!.attachmentId)
    expect(await readFile(attachmentRepository.findById(editedAttachmentId)!.storedPath, 'utf8')).toBe('abc')
    expect(runInputs.findByRunId(editedTurn.runId)!.prompt).toContain('先梳理目标、约束、依赖与实施步骤')

    const mixedContent = { ...createBuddyUserContent(), body: [{ type: 'paragraph' as const, content: [
      { type: 'prompt_directive' as const, directive: 'slash_command' as const, commandMode: 'prompt' as const, value: '/plan' },
      { type: 'text' as const, text: ' Use ' },
      { type: 'prompt_directive' as const, directive: 'skill' as const, value: 'writer' },
    ] }] }
    const mixedDraft = drafts.open({
      draftId: 'draft-2',
      initialContent: mixedContent,
      initialExecutionConfig: {
        approvalPolicy: 'policy',
        executionProfile: 'workspace_write',
      },
      initialModelSelection: null,
      now: '2026-09-06T00:00:01.000Z',
      scope: { kind: 'global' },
    })
    const mixed = await turns.start({
      draftId: mixedDraft.draftId,
      expectedRevision: mixedDraft.revision,
      requestId: 'mixed',
    })
    expect(runInputs.findByRunId(mixed.runId)!.prompt).toContain('先梳理目标、约束、依赖与实施步骤')
    expect(runInputs.findByRunId(mixed.runId)!.prompt).toContain('Use concise wording.')
    expect(conversations.listBranchMessages(mixed.conversationId, mixed.branchId)[0]!.content).toMatchObject({
      resourceSnapshots: [],
      userContent: mixedContent,
    })
    const runsBefore = database.prepare('SELECT count(*) AS count FROM runs').get()
    const badDraft = drafts.open({
      draftId: 'draft-bad-command',
      initialContent: { ...createBuddyUserContent(), body: [{ type: 'paragraph', content: [{ type: 'prompt_directive', directive: 'slash_command', commandMode: 'prompt', value: '/compact' }] }] },
      initialExecutionConfig: {
        approvalPolicy: 'policy',
        executionProfile: 'workspace_write',
      },
      initialModelSelection: null,
      now: '2026-09-06T00:00:02.000Z',
      scope: { kind: 'global' },
    })
    await expect(turns.start({
      draftId: badDraft.draftId,
      expectedRevision: badDraft.revision,
      requestId: 'bad-command',
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    expect(database.prepare('SELECT count(*) AS count FROM runs').get()).toEqual(runsBefore)

    const postCommitContent = {
      ...createBuddyUserContent(),
      body: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'post-commit launch' }] }],
    }
    const postCommitDraft = drafts.save({
      content: postCommitContent,
      draftId: badDraft.draftId,
      executionConfig: badDraft.executionConfig,
      expectedRevision: badDraft.revision,
      modelSelection: badDraft.modelSelection,
      now: '2026-09-06T00:00:03.000Z',
    })
    failNextLaunch = true
    const failedTurn = await turns.start({
      draftId: postCommitDraft.draftId,
      expectedRevision: postCommitDraft.revision,
      requestId: 'postcommit-failure',
    })
    expect(failedTurn.run).toMatchObject({ errorCode: 'AGENT_RUN_FAILED', status: 'failed' })
    expect(drafts.findById(postCommitDraft.draftId)).toMatchObject({
      content: createBuddyUserContent(),
      revision: postCommitDraft.revision + 1,
      scope: {
        branchId: failedTurn.branchId,
        conversationId: failedTurn.conversationId,
        kind: 'conversation_branch',
      },
    })
    const messageCount = database.prepare('SELECT count(*) AS count FROM messages').get()
    const retriedTurn = await turns.regenerateAssistant({
      conversationId: failedTurn.conversationId,
      requestId: 'retry-postcommit-failure',
      sourceRunId: failedTurn.runId,
    })
    expect(retriedTurn.runId).not.toBe(failedTurn.runId)
    expect(retriedTurn.branchId).toBe(failedTurn.branchId)
    expect(database.prepare('SELECT count(*) AS count FROM messages').get()).toEqual(messageCount)
  })

  it('rejects image input before persisting a run when the selected model is text-only', async () => {
    const { service, attachments, database } = await setup()
    const drafts = createComposerDraftRepository(database)
    const runs = createRunRepository(database)
    const imageDraft = drafts.open({
      draftId: 'draft-image',
      initialContent: { ...createBuddyUserContent(), panelResourceIds: ['image-resource'] },
      initialExecutionConfig: { approvalPolicy: 'policy', executionProfile: 'workspace_write' },
      initialModelSelection: null,
      now: '2026-09-06T00:00:00.000Z',
      scope: { kind: 'global' },
    })
    const png = imageBytes()
    service.accept({ draftId: imageDraft.draftId, resources: [{ resourceId: 'image-resource', mimeType: 'image/png', name: 'image.png', sizeBytes: png.length }] })
    await service.complete({ draftId: imageDraft.draftId, resourceId: 'image-resource', bytes: png })
    const turns = new ChatTurnService({
      attachments,
      composerResources: service,
      conversations: createConversationRepository(database),
      conversationLifecycle: { isDeleting: () => false },
      drafts,
      providers: {
        getDefaultModel: async () => ({ modelId: 'text-only', providerId: 'fixture', reasoning: null, serviceTier: null }),
        executionModels: { resolveAvailable: async () => ({
          api: 'openai-completions',
          baseUrl: 'http://127.0.0.1:9',
          contextWindow: 128000,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          id: 'text-only',
          input: ['text'],
          maxTokens: 4096,
          name: 'Text only',
          provider: 'fixture',
          reasoning: false,
        }) },
      },
      runner: { cancel: async () => false },
      runInputs: createRunInputRepository(database),
      runs,
      skills: { materializeForSpace: async () => [] },
      spaces: createSpaceRepository(database),
      turnLauncher: { launch: async runId => ({ runId, completion: Promise.resolve(runs.findById(runId)!) }) },
      turnRequests: createTurnRequestRepository(database),
    })
    await expect(turns.start({
      draftId: imageDraft.draftId,
      expectedRevision: imageDraft.revision,
      requestId: 'image-unsupported',
    })).rejects.toMatchObject({ code: 'MODEL_INPUT_UNSUPPORTED' })
    expect(database.prepare('SELECT count(*) AS count FROM runs').get()).toEqual({ count: 0 })
  })

  it('accepts metadata before bytes, binds a distinct immutable file identity, and replays completion', async () => {
    const { service, paths, attachmentRepository } = await setup()
    const bytes = imageBytes()
    const input = { draftId: 'draft-1', resources: [{ resourceId: 'resource-1', mimeType: 'image/png', name: 'two-pixels.png', sizeBytes: bytes.length }] }
    expect(service.accept(input)).toEqual([{ ...input.resources[0], draftId: 'draft-1', kind: 'image', state: 'importing' }])
    await expect(readdir(paths.draftAttachments('draft-1'))).rejects.toMatchObject({ code: 'ENOENT' })
    const ready = await service.complete({ draftId: 'draft-1', resourceId: 'resource-1', bytes })
    expect(ready.state).toBe('ready')
    if (ready.state !== 'ready' || !('attachmentId' in ready))
      throw new Error('Expected ready resource')
    expect(ready.attachmentId).not.toBe(ready.resourceId)
    expect(await readFile(attachmentRepository.findById(ready.attachmentId)!.storedPath)).toEqual(Buffer.from(bytes))
    expect(await service.complete({ draftId: 'draft-1', resourceId: 'resource-1', bytes })).toEqual(ready)
    expect(await readdir(paths.draftAttachments('draft-1'))).toHaveLength(1)
    expect(service.accept(input)).toEqual([ready])
    await expect(service.complete({ draftId: 'draft-1', resourceId: 'resource-1', bytes: Uint8Array.of(1) })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    expect(service.list('draft-1')).toEqual([ready])
  })

  it('rejects a whole invalid or conflicting metadata batch without partially accepting it', async () => {
    const { service } = await setup()
    const text = { resourceId: 'existing', mimeType: 'text/plain', name: 'note.txt', sizeBytes: 1 }
    service.accept({ draftId: 'draft-1', resources: [text] })
    expect(() => service.accept({ draftId: 'draft-1', resources: [{ ...text, resourceId: 'new' }, { ...text, name: 'changed.txt' }] })).toThrow()
    expect(service.list('draft-1').map(resource => resource.resourceId)).toEqual(['existing'])
    expect(() => service.accept({ draftId: 'draft-1', resources: [{ ...text, resourceId: 'new' }, { ...text, resourceId: 'bad', name: 'bad.pdf', mimeType: 'application/pdf' }] })).toThrow()
    expect(service.list('draft-1')).toHaveLength(1)
  })

  it.each([
    ['image/png', 'bad.png', Uint8Array.of(1, 2), 2],
    ['text/plain', 'bad.txt', Uint8Array.of(255, 254), 2],
    ['text/plain', 'short.txt', Uint8Array.of(65), 2],
  ])('keeps invalid %s input failed, without publishing a file', async (mimeType, name, bytes, sizeBytes) => {
    const { service, attachmentRepository } = await setup()
    service.accept({ draftId: 'draft-1', resources: [{ resourceId: 'resource-1', mimeType, name, sizeBytes }] })
    const failed = await service.complete({ draftId: 'draft-1', resourceId: 'resource-1', bytes })
    expect(failed).toMatchObject({ resourceId: 'resource-1', state: 'failed', errorCode: 'IMPORT_FAILED' })
    expect(attachmentRepository.listDraftsBefore('9999')).toHaveLength(0)
  })

  it('retries the same resource identity and does not allow cross-draft completion', async () => {
    const { service } = await setup()
    service.accept({ draftId: 'draft-1', resources: [{ resourceId: 'resource-1', mimeType: 'text/plain', name: 'note.txt', sizeBytes: 2 }] })
    const target = { draftId: 'draft-1', resourceId: 'resource-1' }
    await expect(service.complete({ ...target, draftId: 'draft-2', bytes: Uint8Array.of(65, 66) })).rejects.toMatchObject({ code: 'ATTACHMENT_NOT_FOUND' })
    service.fail(target)
    expect(service.retry(target)).toMatchObject({ ...target, state: 'importing' })
    expect(await service.complete({ ...target, bytes: Uint8Array.of(65, 66) })).toMatchObject({ ...target, state: 'ready' })
    service.recoverInterruptedImports()
    expect(service.list('draft-1')[0]!.state).toBe('ready')
  })

  it('recovers interrupted imports as failed and keeps confirmed draft resources out of cleanup', async () => {
    const { service, drafts } = await setup()
    service.accept({ draftId: 'draft-1', resources: [1, 2].map(id => ({ resourceId: `resource-${id}`, mimeType: 'text/plain', name: `${id}.txt`, sizeBytes: 1 })) })
    const ready = await service.complete({ draftId: 'draft-1', resourceId: 'resource-1', bytes: Uint8Array.of(65) })
    drafts.open({
      draftId: 'draft-1',
      initialContent: { ...createBuddyUserContent(), panelResourceIds: ['resource-1'] },
      initialExecutionConfig: { approvalPolicy: 'policy', executionProfile: 'workspace_write' },
      initialModelSelection: null,
      now: new Date().toISOString(),
      scope: { kind: 'global' },
    })
    service.recoverInterruptedImports()
    expect(service.list('draft-1')).toEqual([ready, expect.objectContaining({ resourceId: 'resource-2', state: 'failed', errorCode: 'IMPORT_INTERRUPTED' })])
    await service.cleanupDrafts(new Date('2099-01-01').getTime())
    expect(service.list('draft-1')[0]).toEqual(ready)
  })

  it('reclaims an unreferenced draft resource and its managed bytes after retention', async () => {
    const { service, drafts, attachmentRepository } = await setup()
    service.accept({ draftId: 'draft-1', resources: [{ resourceId: 'resource-1', mimeType: 'text/plain', name: '1.txt', sizeBytes: 1 }] })
    const ready = await service.complete({ draftId: 'draft-1', resourceId: 'resource-1', bytes: Uint8Array.of(65) })
    if (ready.state !== 'ready' || !('attachmentId' in ready))
      throw new Error('Expected ready resource')
    drafts.open({
      draftId: 'draft-1',
      initialContent: createBuddyUserContent(),
      initialExecutionConfig: { approvalPolicy: 'policy', executionProfile: 'workspace_write' },
      initialModelSelection: null,
      now: new Date().toISOString(),
      scope: { kind: 'global' },
    })

    await expect(service.cleanupDrafts(new Date('2099-01-01').getTime())).resolves.toEqual([ready.attachmentId])
    expect(service.list('draft-1')).toEqual([])
    expect(attachmentRepository.findById(ready.attachmentId)).toBeNull()
  })

  it('rejects native files beyond the current resource capacity before copying them', async () => {
    const { service, attachmentRepository, root } = await setup()
    const sourcePath = join(root, 'note.txt')
    await writeFile(sourcePath, 'note')
    const resources = Array.from({ length: BUDDY_ATTACHMENT_COUNT_LIMIT }, (_, index) => ({
      mimeType: 'text/plain',
      name: `${index}.txt`,
      resourceId: `resource-${index}`,
      sizeBytes: 1,
    }))
    service.accept({ draftId: 'draft-1', resources })

    await expect(service.registerFiles({
      draftId: 'draft-1',
      paths: [sourcePath],
      referencedResourceIds: resources.map(resource => resource.resourceId),
    })).rejects.toMatchObject({ code: 'ATTACHMENT_LIMIT_EXCEEDED' })
    expect(attachmentRepository.listDraftsBefore('9999')).toEqual([])
  })

  it('restores a ready resource with unavailable storage as a removable failure', async () => {
    const { service } = await setup()
    service.accept({ draftId: 'draft-1', resources: [{ resourceId: 'resource-1', mimeType: 'text/plain', name: '1.txt', sizeBytes: 1 }] })
    const ready = await service.complete({ draftId: 'draft-1', resourceId: 'resource-1', bytes: Uint8Array.of(65) })
    if (ready.state !== 'ready' || !('attachmentId' in ready))
      throw new Error('Expected ready resource')

    service.recoverInterruptedImports([ready.attachmentId])

    expect(service.list('draft-1')).toEqual([
      expect.objectContaining({
        errorCode: 'IMPORT_INTERRUPTED',
        resourceId: 'resource-1',
        state: 'failed',
      }),
    ])
    expect('attachmentId' in service.list('draft-1')[0]!).toBe(false)
  })

  it('projects two images with repeat references and a panel-only text file exactly once', async () => {
    const { service, attachments } = await setup()
    const bytes = imageBytes()
    for (const id of ['red', 'blue']) {
      service.accept({ draftId: 'draft-1', resources: [{ resourceId: id, mimeType: 'image/png', name: `${id}.png`, sizeBytes: bytes.length }] })
      await service.complete({ draftId: 'draft-1', resourceId: id, bytes })
    }
    service.accept({ draftId: 'draft-1', resources: [{ resourceId: 'note', mimeType: 'text/plain', name: 'note.txt', sizeBytes: 3 }] })
    await service.complete({ draftId: 'draft-1', resourceId: 'note', bytes: new TextEncoder().encode('abc') })
    const content = { ...createBuddyUserContent(), panelResourceIds: ['red', 'blue', 'note'], body: [{ type: 'paragraph' as const, content: [
      { type: 'resource_ref' as const, resourceId: 'red' },
      { type: 'text' as const, text: ' vs ' },
      { type: 'resource_ref' as const, resourceId: 'blue' },
      { type: 'resource_ref' as const, resourceId: 'red' },
    ] }] }
    const bindings = await service.resolveInput('draft-1', content)
    const result = await attachments.materializePrompt(bindings.map(binding => binding.attachmentId), '', null, 'draft-1', { content, resourceIds: bindings.map(binding => binding.resourceId) })
    expect(result.prompt).toBe('[FILE#1]\n\n[IMAGE#1] vs [IMAGE#2][IMAGE#1]\n\n[FILE#1] note.txt\nabc')
    expect(result.images).toHaveLength(2)
    expect(result.records).toHaveLength(3)
  })
})
