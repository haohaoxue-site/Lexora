import type { ProcessSystemTarget } from '../../../systemCapability'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'
import { runNativeProcessControl } from '../../../../../../platform/process/processControl'
import { SystemCapabilityService } from '../../../systemCapability'
import { WindowsSystemHost } from '../WindowsSystemHost'

assert.equal(process.platform, 'win32')
const [helper, fixtureSource, resultPath] = process.argv.slice(2)
assert.ok(helper && fixtureSource && resultPath)
process.env.LEXORA_BUDDY_PROCESS_CONTROL = resolve(helper)
const directory = await mkdtemp(join(tmpdir(), 'buddy-process-contract-'))
const executable = join(directory, '示例进程.exe')
const children: ReturnType<typeof spawn>[] = []
const host = new WindowsSystemHost()
const signal = new AbortController().signal
const checks: string[] = []

async function start(mode: string) {
  const child = spawn(executable, [mode], { stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(child)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const [chunk] = await once(child.stdout!, 'data', { signal: controller.signal })
    assert.match(String(chunk), /ready/)
  }
  finally {
    clearTimeout(timeout)
  }
  assert.ok(child.pid)
  return child.pid
}

async function target(pid: number): Promise<ProcessSystemTarget> {
  const result = await host.resolveTargets({ kind: 'process', pid }, signal)
  assert.equal(result.length, 1)
  const found = result[0]!
  assert.equal(found.kind, 'process')
  assert.ok(found.kind === 'process')
  return found
}

async function act(current: ProcessSystemTarget, action: 'kill-process' | 'terminate-process') {
  const service = new SystemCapabilityService({ host })
  const request = { action, target: { kind: 'process' as const, pid: current.pid }, reason: 'Test-owned process only' }
  await service.prepareAction('fixture-action', request, signal)
  return service.act('fixture-action', request, signal)
}

try {
  execFileSync(join(process.env.SystemRoot!, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'), [
    '/nologo',
    '/target:exe',
    `/out:${executable}`,
    '/reference:System.Windows.Forms.dll',
    resolve(fixtureSource),
  ])
  const headless = await target(await start('headless'))
  assert.equal(headless.executable, executable)
  assert.match(headless.instanceId, /^\d{17,20}$/)
  assert.ok(Math.abs(Date.now() - Date.parse(headless.startedAt)) < 15_000)
  assert.deepEqual(headless.allowedActions, ['kill-process'])
  const named = (await host.resolveTargets({ kind: 'process', name: basename(executable).replace('.exe', '.EXE') }, signal))[0]
  assert.ok(named?.kind === 'process')
  assert.equal(named.pid, headless.pid)
  checks.push('fixed helper path, Unicode name and exact creation identity')

  for (const replacement of [{ instanceId: `${BigInt(headless.instanceId) + 1n}` }, { executable: `${executable}.changed` }]) {
    await assert.rejects(host.execute({ ...headless, ...replacement }, 'kill-process', signal), { code: 'SYSTEM_TARGET_CHANGED' })
    assert.ok(await host.readTarget(headless, signal))
  }
  checks.push('changed creation time or executable cannot terminate the process')

  const protectedResult = await runNativeProcessControl({ operation: 'execute', pid: headless.pid, instanceId: headless.instanceId, executable, action: 'kill-process', protectedPids: [headless.pid] }, signal)
  assert.equal(protectedResult.stderr.trim(), 'SYSTEM_ACTION_NOT_ALLOWED')
  assert.equal(protectedResult.code, 1)
  assert.deepEqual((await target(process.pid)).allowedActions, [])
  assert.deepEqual((await target(process.ppid)).allowedActions, [])
  checks.push('explicit protected process, runtime and parent remain protected')

  await assert.rejects(host.execute({ ...headless, allowedActions: ['terminate-process'] }, 'terminate-process', signal), { code: 'SYSTEM_ACTION_NOT_ALLOWED' })
  const aborted = AbortSignal.abort(new Error('cancelled before execution'))
  await assert.rejects(host.execute(headless, 'kill-process', aborted))
  assert.ok(await host.readTarget(headless, signal))
  checks.push('windowless graceful exit and pre-aborted execution have no side effects')

  const gui = await target(await start('gui'))
  assert.deepEqual(gui.allowedActions, ['terminate-process', 'kill-process'])
  assert.equal((await host.resolveTargets({ kind: 'process', name: '示例进程' }, signal)).length, 2)
  const service = new SystemCapabilityService({ host })
  await assert.rejects(service.prepareAction('ambiguous', { action: 'kill-process', target: { kind: 'process', name: '示例进程' }, reason: 'Ambiguity test' }, signal), { code: 'SYSTEM_TARGET_AMBIGUOUS' })
  assert.equal((await act(gui, 'terminate-process')).status, 'completed')
  assert.equal(await host.readTarget(gui, signal), null)
  checks.push('name ambiguity is preserved and WM_CLOSE gracefully exits a windowed fixture')

  const refusing = await target(await start('ignore-close'))
  const outcome = await act(refusing, 'terminate-process')
  assert.equal(outcome.status, 'needs-escalation')
  assert.equal(outcome.verified, false)
  assert.ok(await host.readTarget(refusing, signal))
  const cancelling = new AbortController()
  const pending = host.execute(refusing, 'terminate-process', cancelling.signal)
  setTimeout(() => cancelling.abort(), 150)
  await assert.rejects(pending)
  assert.ok(await host.readTarget(refusing, signal))
  checks.push('refused or cancelled graceful exit never escalates to force kill')

  assert.equal((await act(refusing, 'kill-process')).status, 'completed')
  assert.equal((await act(headless, 'kill-process')).status, 'completed')
  assert.equal(await host.readTarget(headless, signal), null)
  await assert.rejects(host.execute(headless, 'kill-process', signal), { code: 'SYSTEM_TARGET_CHANGED' })
  checks.push('explicit force kill verifies exit and missing identity is rejected')
}
finally {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill()
      await once(child, 'exit', { signal: AbortSignal.timeout(5000) })
    }
  }
  await rm(directory, { recursive: true })
}
const result = { passed: true, helperSha256: createHash('sha256').update(await readFile(helper)).digest('hex'), checks, fixturesRemoved: true }
await writeFile(resultPath, JSON.stringify(result, null, 2))
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
