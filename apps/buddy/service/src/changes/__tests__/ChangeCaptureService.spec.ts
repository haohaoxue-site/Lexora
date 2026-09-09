import type { DatabaseSync } from 'node:sqlite'
import { mkdir, mkdtemp, open, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { prepareTestTurnRequest } from '../../storage/__tests__/composerDraftTestFixture'
import { BuddyDataPaths } from '../../storage/BuddyDataPaths'
import { openBuddyDatabase } from '../../storage/database'
import { ChangeCaptureService } from '../ChangeCaptureService'
import { createChangeSetRepository } from '../changeSetRepository'

const databases: DatabaseSync[] = []
const directories: string[] = []

afterEach(async () => {
  for (const database of databases.splice(0))
    database.close()
  await Promise.all(directories.splice(0).map(path => rm(path, { force: true, recursive: true })))
})

describe('changeCaptureService', () => {
  it('does not report a skipped oversized file as deleted after a partial scan', async () => {
    const root = await mkdtemp(join(tmpdir(), 'buddy-partial-change-'))
    directories.push(root)
    const workspace = join(root, 'workspace')
    await mkdir(workspace)
    const path = join(workspace, 'growing.txt')
    await writeFile(path, 'before')
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    seedRun(database)
    const service = new ChangeCaptureService({ paths: new BuddyDataPaths(root), repository: createChangeSetRepository(database) })
    const input = { cwd: workspace, conversationId: 'conversation-1', runId: 'run-1', toolCallId: 'shell-partial', grants: [{ root: workspace, canonicalRoot: workspace, grantId: 'workspace', kind: 'workspace' as const }] }
    await service.beginWorkspaceTool(input)
    const file = await open(path, 'r+')
    try {
      await file.truncate(33 * 1024 * 1024)
    }
    finally {
      await file.close()
    }
    expect(await service.finishWorkspaceTool({ ...input, isError: false, toolName: 'bash' })).toEqual({ complete: false })
    await service.markPartial(input)
    await service.finalizeRun(input.runId)
    expect(await service.getVisibleDetail(input.runId)).toMatchObject({ coverage: 'partial', files: [], fileCount: 0 })
  })

  it('records every actual file-tool change in the run ChangeSet', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lexora-buddy-changes-created-'))
    directories.push(root)
    const workspace = join(root, 'workspace')
    await mkdir(workspace)
    const grants = [{ canonicalRoot: workspace, grantId: 'directory-1', kind: 'workspace' as const, root: workspace }]
    const createdPath = join(workspace, 'hello-world.html')
    const existingPath = join(workspace, 'existing.html')
    await writeFile(existingPath, '<p>before</p>')
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    seedRun(database)
    const service = new ChangeCaptureService({
      paths: new BuddyDataPaths(root),
      repository: createChangeSetRepository(database),
    })

    await service.beginFileTool({
      arguments: { path: createdPath },
      conversationId: 'conversation-1',
      cwd: workspace,
      grants,
      runId: 'run-1',
      toolCallId: 'tool-created',
      toolName: 'write',
    })
    await writeFile(createdPath, '<h1>Hello World</h1>')
    await expect(service.finishFileTool({
      conversationId: 'conversation-1',
      cwd: workspace,
      grants,
      isError: false,
      runId: 'run-1',
      toolCallId: 'tool-created',
      toolName: 'write',
    })).resolves.toBeUndefined()

    await service.beginFileTool({
      arguments: { path: existingPath },
      conversationId: 'conversation-1',
      cwd: workspace,
      grants,
      runId: 'run-1',
      toolCallId: 'tool-existing',
      toolName: 'write',
    })
    await writeFile(existingPath, '<p>after</p>')
    await expect(service.finishFileTool({
      conversationId: 'conversation-1',
      cwd: workspace,
      grants,
      isError: false,
      runId: 'run-1',
      toolCallId: 'tool-existing',
      toolName: 'write',
    })).resolves.toBeUndefined()
  })

  it('discovers nested shell changes and retains unambiguous moves', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lexora-buddy-changes-shell-'))
    directories.push(root)
    const workspace = join(root, 'workspace')
    await mkdir(workspace)
    const grants = [{ canonicalRoot: workspace, grantId: 'directory-1', kind: 'workspace' as const, root: workspace }]
    const changedPath = join(workspace, 'change.txt')
    const removedPath = join(workspace, 'remove.txt')
    const movedFromPath = join(workspace, 'old-name.txt')
    const movedToPath = join(workspace, 'renamed.txt')
    const createdPath = join(workspace, 'site', 'src', 'index.html')
    await writeFile(changedPath, 'before change')
    await writeFile(removedPath, 'remove me')
    await writeFile(movedFromPath, 'unique move content')
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    seedRun(database)
    const service = new ChangeCaptureService({
      paths: new BuddyDataPaths(root),
      repository: createChangeSetRepository(database),
    })

    await service.beginWorkspaceTool({
      conversationId: 'conversation-1',
      cwd: workspace,
      grants,
      runId: 'run-1',
      toolCallId: 'tool-shell',
    })
    await mkdir(join(workspace, 'site', 'src'), { recursive: true })
    await writeFile(createdPath, '<h1>Hello</h1>')
    await writeFile(changedPath, 'after change')
    await unlink(removedPath)
    await rename(movedFromPath, movedToPath)

    await expect(service.finishWorkspaceTool({
      conversationId: 'conversation-1',
      cwd: workspace,
      grants,
      isError: false,
      runId: 'run-1',
      toolCallId: 'tool-shell',
      toolName: 'bash',
    })).resolves.toEqual({
      complete: true,
    })
    await service.finalizeRun('run-1')

    expect(service.listSummariesForRuns(['run-1'])).toMatchObject([{
      coverage: 'complete',
      fileCount: 5,
      status: 'completed',
    }])
    await expect(service.getVisibleDetail('run-1')).resolves.toMatchObject({
      files: expect.arrayContaining([
        expect.objectContaining({ changeType: 'modified', path: 'change.txt' }),
        expect.objectContaining({ changeType: 'deleted', path: 'old-name.txt' }),
        expect.objectContaining({ changeType: 'deleted', path: 'remove.txt' }),
        expect.objectContaining({ changeType: 'created', path: 'renamed.txt' }),
        expect.objectContaining({ changeType: 'created', path: 'site/src/index.html' }),
      ]),
    })
  })

  it('aggregates repeated writes into one run-scoped before and after diff', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lexora-buddy-changes-'))
    directories.push(root)
    const workspace = join(root, 'workspace')
    await mkdir(workspace)
    const grants = [{ canonicalRoot: workspace, grantId: 'directory-1', kind: 'workspace' as const, root: workspace }]
    const path = join(workspace, 'hello.ts')
    await writeFile(path, 'export const greeting = "before"\n')
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    seedRun(database)
    const service = new ChangeCaptureService({
      paths: new BuddyDataPaths(root),
      repository: createChangeSetRepository(database),
    })

    await service.beginFileTool({
      arguments: { path },
      conversationId: 'conversation-1',
      cwd: workspace,
      grants,
      runId: 'run-1',
      toolCallId: 'tool-1',
      toolName: 'write',
    })
    await writeFile(path, 'export const greeting = "middle"\n')
    await service.finishFileTool({
      conversationId: 'conversation-1',
      cwd: workspace,
      grants,
      isError: false,
      runId: 'run-1',
      toolCallId: 'tool-1',
      toolName: 'write',
    })
    await service.beginFileTool({
      arguments: { path },
      conversationId: 'conversation-1',
      cwd: workspace,
      grants,
      runId: 'run-1',
      toolCallId: 'tool-2',
      toolName: 'edit',
    })
    await writeFile(path, 'export const greeting = "after"\n')
    await service.finishFileTool({
      conversationId: 'conversation-1',
      cwd: workspace,
      grants,
      isError: false,
      runId: 'run-1',
      toolCallId: 'tool-2',
      toolName: 'edit',
    })
    await service.finalizeRun('run-1')

    expect(service.listSummariesForRuns(['run-1'])).toEqual([{
      changeSetId: 'run-1',
      conversationId: 'conversation-1',
      coverage: 'complete',
      fileCount: 1,
      runId: 'run-1',
      status: 'completed',
      updatedAt: expect.any(String),
    }])
    await expect(service.getVisibleDetail('run-1')).resolves.toMatchObject({
      changeSetId: 'run-1',
      files: [{
        afterText: 'export const greeting = "after"\n',
        beforeText: 'export const greeting = "before"\n',
        changeType: 'modified',
        path: 'hello.ts',
        preview: 'text',
      }],
    })
  })

  it('aggregates only the requested runs and drops net-zero changes across turns', async () => {
    const root = await mkdtemp(join(tmpdir(), 'buddy-branch-changes-'))
    directories.push(root)
    const workspace = join(root, 'workspace')
    await mkdir(workspace)
    const path = join(workspace, 'value.txt')
    await writeFile(path, 'initial')
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    const service = new ChangeCaptureService({ paths: new BuddyDataPaths(root), repository: createChangeSetRepository(database) })
    for (const [index, text] of ['middle', 'final', 'initial'].entries()) {
      seedRun(database, index + 1)
      const input = { conversationId: 'conversation-1', cwd: workspace, runId: `run-${index + 1}`, toolCallId: `tool-${index}`, toolName: 'write' as const, grants: [{ root: workspace, canonicalRoot: workspace, grantId: 'workspace', kind: 'workspace' as const }] }
      await service.beginFileTool({ ...input, arguments: { path } })
      await writeFile(path, text)
      await service.finishFileTool({ ...input, isError: false })
      await service.finalizeRun(input.runId)
      database.prepare('UPDATE runs SET status = \'completed\' WHERE id = ?').run(input.runId)
    }
    expect(await service.getForRuns(['run-1', 'run-2'])).toMatchObject({ files: [{ beforeText: 'initial', afterText: 'final' }] })
    expect(await service.getForRuns(['run-2'])).toMatchObject({ files: [{ beforeText: 'middle', afterText: 'final' }] })
    expect(await service.getForRuns(['run-1', 'run-2', 'run-3'])).toMatchObject({ files: [] })
    expect(await service.getForRuns([])).toMatchObject({ coverage: 'complete', files: [], status: 'completed' })
  })

  it('marks bash coverage as partial without parsing its command', async () => {
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    seedRun(database)
    const root = await mkdtemp(join(tmpdir(), 'lexora-buddy-changes-partial-'))
    directories.push(root)
    const service = new ChangeCaptureService({
      paths: new BuddyDataPaths(root),
      repository: createChangeSetRepository(database),
    })

    await service.markPartial({
      conversationId: 'conversation-1',
      runId: 'run-1',
    })
    await service.finalizeRun('run-1')

    expect(service.listSummariesForRuns(['run-1'])).toMatchObject([{
      coverage: 'partial',
      fileCount: 0,
      status: 'completed',
    }])
  })

  it('degrades a missing text snapshot instead of presenting an empty diff', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lexora-buddy-changes-missing-'))
    directories.push(root)
    const workspace = join(root, 'workspace')
    await mkdir(workspace)
    const grants = [{ canonicalRoot: workspace, grantId: 'directory-1', kind: 'workspace' as const, root: workspace }]
    const path = join(workspace, 'hello.ts')
    await writeFile(path, 'before\n')
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    databases.push(database)
    seedRun(database)
    const repository = createChangeSetRepository(database)
    const service = new ChangeCaptureService({
      paths: new BuddyDataPaths(root),
      repository,
    })

    await service.beginFileTool({
      arguments: { path },
      conversationId: 'conversation-1',
      cwd: workspace,
      grants,
      runId: 'run-1',
      toolCallId: 'tool-1',
      toolName: 'edit',
    })
    await writeFile(path, 'after\n')
    await service.finishFileTool({
      conversationId: 'conversation-1',
      cwd: workspace,
      grants,
      isError: false,
      runId: 'run-1',
      toolCallId: 'tool-1',
      toolName: 'edit',
    })
    await service.finalizeRun('run-1')
    const snapshotPath = repository.listCaptures('run-1')[0]?.before.snapshotPath
    expect(snapshotPath).toBeTruthy()
    await unlink(snapshotPath!)

    await expect(service.getVisibleDetail('run-1')).resolves.toMatchObject({
      files: [{
        afterText: null,
        beforeText: null,
        preview: 'unavailable',
      }],
    })
  })
})

function seedRun(database: DatabaseSync, index = 1): void {
  prepareTestTurnRequest(database, {
    attachmentBindings: [],
    branchId: 'branch-1',
    conversationId: 'conversation-1',
    createdAt: '2026-08-28T00:00:00.000Z',
    approvalPolicy: 'policy' as const,
    executionProfile: 'workspace_write',
    model: 'model-1',
    spaceId: null,
    provider: 'provider-1',
    requestFingerprint: 'fingerprint-1',
    requestId: `request-${index}`,
    runId: `run-${index}`,
    runInput: {
      attachmentIds: [],
      contextItems: [],
      prompt: 'hello',
      reasoning: null,
      serviceTier: null,
    },
    title: 'Conversation',
    userMessageContent: { attachmentIds: [], text: 'hello' },
    userMessageId: `message-${index}`,
  })
}
