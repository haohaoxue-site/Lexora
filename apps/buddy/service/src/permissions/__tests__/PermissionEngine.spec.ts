import type { PermissionGrant, PermissionRequest } from '../permissionContract'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { PermissionEngine } from '../PermissionEngine'
import { createSensitivePathMatcher } from '../sensitivePaths'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { force: true, recursive: true })))
})

describe('permissionEngine', () => {
  it('allows outside reads and asks once to grant an outside write', async () => {
    const fixture = await createFixture()
    const engine = createEngine(fixture.home)
    const readPath = join(fixture.outside, 'notes.md')
    await writeFile(readPath, 'notes')

    await expect(engine.decide(request(fixture, {
      arguments: { path: readPath },
      toolName: 'read',
    }))).resolves.toEqual({ type: 'allow' })
    await expect(engine.decide(request(fixture, {
      arguments: { content: 'draft', path: join(fixture.outside, 'draft.md') },
      toolName: 'write',
    }))).resolves.toEqual({
      allowForTurn: true,
      grant: {
        owner: { id: 'conversation-1', kind: 'conversation' },
        root: fixture.outside,
      },
      kind: 'write',
      paths: [{ path: join(fixture.outside, 'draft.md'), zone: 'outside' }],
      summary: 'Write outside the workspace',
      type: 'ask',
    })
  })

  it('denies mutations in read-only mode without offering approval', async () => {
    const fixture = await createFixture()
    const engine = createEngine(fixture.home)

    await expect(engine.decide(request(fixture, {
      arguments: { content: 'draft', path: join(fixture.workspace, 'draft.md') },
      profile: 'read_only',
      toolName: 'write',
    }))).resolves.toEqual({
      code: 'READ_ONLY_PROFILE',
      source: 'profile',
      type: 'deny',
    })
  })

  it('asks before policy-allowed mutations when manual approval is selected', async () => {
    const fixture = await createFixture()
    const engine = createEngine(fixture.home)

    await expect(engine.decide({
      ...request(fixture, {
        arguments: { content: 'draft', path: join(fixture.workspace, 'draft.md') },
        toolName: 'write',
      }),
      approvalPolicy: 'manual',
    } as PermissionRequest)).resolves.toEqual({
      allowForTurn: true,
      kind: 'write',
      paths: [{ path: join(fixture.workspace, 'draft.md'), zone: 'workspace' }],
      summary: 'Write local content',
      type: 'ask',
    })
  })

  it('asks before reading a sensitive file and denies sensitive writes', async () => {
    const fixture = await createFixture()
    const engine = createEngine(fixture.home)
    const ssh = join(fixture.home, '.ssh')
    await mkdir(ssh)
    const secret = join(ssh, 'id_ed25519')
    await writeFile(secret, 'secret')

    await expect(engine.decide(request(fixture, {
      arguments: { path: secret },
      toolName: 'read',
    }))).resolves.toMatchObject({ allowForTurn: false, kind: 'read', type: 'ask' })
    await expect(engine.decide(request(fixture, {
      arguments: { content: 'changed', path: secret },
      profile: 'full_access',
      toolName: 'write',
    }))).resolves.toEqual({
      code: 'SENSITIVE_PATH',
      source: 'sensitive',
      type: 'deny',
    })
  })

  it('turns an unavailable approval into an explicit background denial', async () => {
    const fixture = await createFixture()
    const engine = createEngine(fixture.home)

    await expect(engine.decide(request(fixture, {
      approvalAvailable: false,
      arguments: { command: 'python transform.py' },
      toolName: 'bash',
    }))).resolves.toEqual({
      code: 'APPROVAL_UNAVAILABLE_IN_BACKGROUND',
      source: 'profile',
      type: 'deny',
    })
  })

  it('keeps safe shell inspection available in read-only mode', async () => {
    const fixture = await createFixture()
    const engine = createEngine(fixture.home)

    await expect(engine.decide(request(fixture, {
      arguments: { command: 'pwd' },
      profile: 'read_only',
      toolName: 'bash',
    }))).resolves.toEqual({ type: 'allow' })
    await expect(engine.decide(request(fixture, {
      arguments: { command: 'python transform.py' },
      profile: 'read_only',
      toolName: 'bash',
    }))).resolves.toEqual({
      code: 'READ_ONLY_PROFILE',
      source: 'profile',
      type: 'deny',
    })
  })

  it('forces confirmation for unknown capabilities and recognizable system mutations', async () => {
    const fixture = await createFixture()
    const engine = createEngine(fixture.home)

    await expect(engine.decide(request(fixture, {
      arguments: {},
      profile: 'full_access',
      toolName: 'unknown_tool',
    }))).resolves.toMatchObject({
      allowForTurn: false,
      kind: 'system',
      type: 'ask',
    })
    await expect(engine.decide(request(fixture, {
      arguments: { command: 'systemctl --user restart example.service' },
      profile: 'full_access',
      toolName: 'bash',
    }))).resolves.toMatchObject({
      allowForTurn: false,
      kind: 'shell',
      type: 'ask',
    })
    await expect(engine.decide(request(fixture, {
      arguments: { command: 'sudo /usr/bin/systemctl --user restart example.service' },
      profile: 'full_access',
      toolName: 'bash',
    }))).resolves.toMatchObject({
      allowForTurn: false,
      kind: 'shell',
      type: 'ask',
    })
    await expect(engine.decide(request(fixture, {
      arguments: { command: 'bash -c \'shutdown now\'' },
      profile: 'full_access',
      toolName: 'bash',
    }))).resolves.toMatchObject({
      allowForTurn: false,
      kind: 'shell',
      type: 'ask',
    })
    await expect(engine.decide(request(fixture, {
      access: 'execute',
      arguments: {},
      forceAsk: true,
      profile: 'read_only',
      toolName: 'lexora_system_action',
    }))).resolves.toEqual({
      code: 'READ_ONLY_PROFILE',
      source: 'profile',
      type: 'deny',
    })
  })

  it('requires multi-root writes to be split before any directory is granted', async () => {
    const fixture = await createFixture()
    const engine = createEngine(fixture.home)

    await expect(engine.decide(request(fixture, {
      access: 'write',
      arguments: {},
      paths: [
        { mode: 'create', path: join(fixture.outside, 'draft.md') },
        { mode: 'create', path: join(fixture.otherOutside, 'result.md') },
      ],
      toolName: 'multi_write',
    }))).resolves.toEqual({
      code: 'MULTIPLE_DIRECTORY_GRANTS_REQUIRED',
      source: 'invalid',
      type: 'deny',
    })
  })
})

function createEngine(home: string): PermissionEngine {
  return new PermissionEngine({ sensitive: createSensitivePathMatcher({ home }) })
}

function request(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  overrides: Partial<PermissionRequest> & Pick<PermissionRequest, 'arguments' | 'toolName'>,
): PermissionRequest {
  return {
    approvalPolicy: 'policy',
    approvalAvailable: true,
    cwd: fixture.workspace,
    grants: fixture.grants,
    owner: { id: 'conversation-1', kind: 'conversation' },
    profile: 'workspace_write',
    ...overrides,
  }
}

async function createFixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'lexora-engine-')))
  roots.push(root)
  const workspace = join(root, 'workspace')
  const outside = join(root, 'outside')
  const otherOutside = join(root, 'other-outside')
  const home = join(root, 'home')
  await Promise.all([workspace, outside, otherOutside, home].map(path => mkdir(path)))
  const grants: PermissionGrant[] = [{
    canonicalRoot: workspace,
    grantId: 'conversation-1',
    kind: 'workspace' as const,
    root: workspace,
  }]
  return { grants, home, otherOutside, outside, workspace }
}
