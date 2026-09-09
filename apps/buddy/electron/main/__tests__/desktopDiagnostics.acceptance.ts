import type { DesktopDiagnosticLoggerOptions, DesktopDiagnosticRecord } from '../desktopDiagnostics'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { DesktopDiagnosticLogger } from '../desktopDiagnostics'

const root = await mkdtemp(join(tmpdir(), 'lexora-recorder-中文-'))
const loggers: DesktopDiagnosticLogger[] = []
const event = { scope: 'desktop', level: 'info', event: 'acceptance.record' } as const

function createLogger(name: string, options: Partial<DesktopDiagnosticLoggerOptions> = {}) {
  const directory = join(root, name)
  const logger = new DesktopDiagnosticLogger({ directory, appVersion: 'acceptance', userHome: homedir(), ...options })
  loggers.push(logger)
  return { directory, logger }
}

async function readRecords(directory: string, name = 'application.jsonl'): Promise<DesktopDiagnosticRecord[]> {
  const text = await readFile(join(directory, name), 'utf8')
  assert.ok(text.endsWith('\n'))
  return text.trimEnd().split('\n').map(line => JSON.parse(line) as DesktopDiagnosticRecord)
}

try {
  const streams = createLogger('streams')
  const childScript = join(root, 'stderr-child.cjs')
  await writeFile(childScript, `
    const text = Buffer.from('中文\\nAuthorization: Bea');
    process.stderr.write(text.subarray(0, 1));
    process.stderr.write(text.subarray(1));
    setTimeout(() => process.stderr.end('rer fixture-secret'), 10);
  `)
  const child = spawn(process.execPath, [childScript], { stdio: ['ignore', 'ignore', 'pipe'] })
  streams.logger.captureOutput('local-service', child.stderr)
  const [exitCode] = await once(child, 'exit')
  assert.equal(exitCode, 0)
  const streamStatus = await streams.logger.close()
  assert.equal(streamStatus.closeTimedOut, false)
  assert.equal(streamStatus.written, 2, JSON.stringify(streamStatus))
  assert.deepEqual((await readRecords(streams.directory)).map(record => record.message), ['中文', 'Authorization: <redacted>'])

  const rotation = createLogger('rotation', { maxFileBytes: 16 * 1024, maxFiles: 3 })
  for (let index = 0; index < 6; index++) {
    assert.equal(rotation.logger.record({ ...event, operationId: String(index), message: 'x'.repeat(10000) }), true)
    await rotation.logger.flush()
  }
  assert.equal((await rotation.logger.close()).failed, 0)
  const files = await readdir(rotation.directory)
  assert.equal(files.length, 3)
  for (const file of files) {
    assert.ok((await stat(join(rotation.directory, file))).size <= 16 * 1024)
    assert.equal((await readRecords(rotation.directory, file)).length, 1)
  }
  assert.equal((await readRecords(rotation.directory))[0]!.operationId, '5')

  const previousLaunchId = (await readRecords(rotation.directory))[0]!.launchId
  const restarted = createLogger('rotation', { maxFiles: 3 })
  restarted.logger.record(event)
  await restarted.logger.close()
  assert.notEqual((await readRecords(restarted.directory))[0]!.launchId, previousLaunchId)
  assert.equal((await readRecords(restarted.directory, 'application.1.jsonl'))[0]!.operationId, '5')

  await writeFile(join(root, 'blocked'), 'not a directory')
  const failure = createLogger('blocked')
  failure.logger.record(event)
  assert.equal((await failure.logger.close()).failed, 1)
  assert.ok(failure.logger.status.lastError)
  process.stdout.write(`${JSON.stringify({ platform: process.platform, node: process.version, checks: ['child-stderr', 'utf8', 'redaction', 'exit-drain', 'rotation', 'restart', 'io-failure'], result: 'passed' })}\n`)
}
finally {
  await Promise.all(loggers.map(logger => logger.close()))
  await rm(root, { recursive: true, force: true })
}
