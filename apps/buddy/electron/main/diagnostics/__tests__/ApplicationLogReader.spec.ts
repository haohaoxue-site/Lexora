import type { ApplicationLogRecord } from '../../../../shared/diagnostics/applicationLog'
import { appendFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { createTemporaryDirectory } from '@buddy-tests/temporaryDirectories'
import { describe, expect, it } from 'vitest'
import { applicationLogCategory } from '../../../../shared/diagnostics/applicationLog'
import { DesktopDiagnosticLogger } from '../../desktopDiagnostics'
import { ApplicationLogReader } from '../ApplicationLogReader'

function record(sequence: number, fields: Partial<ApplicationLogRecord> = {}): ApplicationLogRecord {
  return { schemaVersion: 1, timestamp: '2026-09-09T00:00:00.000Z', elapsedMs: sequence, sequence, launchId: 'launch-current', appVersion: '0.3.0', platform: 'linux', collectorPid: 42, scope: 'desktop', level: 'info', event: 'app.ready', ...fields }
}

async function fixture() {
  const directory = await createTemporaryDirectory('lexora-log-reader-')
  const file = join(directory, 'application.jsonl')
  const reader = new ApplicationLogReader(directory, 'launch-current', '/home/fixture')
  const write = (records: ApplicationLogRecord[], name = 'application.jsonl') => writeFile(join(directory, name), `${records.map(item => JSON.stringify(item)).join('\n')}\n`)
  return { directory, file, reader, write }
}

describe('application log queries', () => {
  it('reads the actual recorder format, discovers launches and defaults to the current launch', async () => {
    const { directory } = await fixture()
    const first = new DesktopDiagnosticLogger({ directory, appVersion: '0.2.0', userHome: '/home/fixture' })
    first.record({ scope: 'desktop', level: 'info', event: 'app.starting' })
    await first.close()
    const current = new DesktopDiagnosticLogger({ directory, appVersion: '0.3.0', userHome: '/home/fixture' })
    current.record({ scope: 'local-service', level: 'info', event: 'turn.completed', conversationId: 'task-1', runId: 'run-1', turnId: 'run-1:2', durationMs: 100 })
    await current.close()
    const reader = new ApplicationLogReader(directory, current.launchId, '/home/fixture')
    const page = await reader.query({})
    expect(page.records).toHaveLength(1)
    expect(page.records[0]).toMatchObject({ event: 'turn.completed', conversationId: 'task-1', turnId: 'run-1:2' })
    expect(page.launches.map(item => item.launchId)).toContain(first.launchId)
    expect((await reader.query({ launch: 'all' })).records.map(item => item.event)).toEqual(['turn.completed', 'app.starting'])
  })

  it('keeps numbered pages and totals stable across appends and file rotation', async () => {
    const { directory, file, reader, write } = await fixture()
    await write([1, 2, 3, 4, 5].map(sequence => record(sequence)))
    const latest = await reader.query({ pageSize: 2 })
    expect(latest).toMatchObject({ total: 5, page: 1, pageSize: 2 })
    expect(latest.records.map(item => item.sequence)).toEqual([5, 4])
    await rename(file, join(directory, 'application.1.jsonl'))
    await write([record(6)])
    const older = await reader.query({ pageSize: 2, page: 2, anchor: latest.anchor! })
    expect(older).toMatchObject({ total: 5, page: 2 })
    expect(older.records.map(item => item.sequence)).toEqual([3, 2])
    const last = await reader.query({ pageSize: 2, page: 99, anchor: latest.anchor! })
    expect(last.records.map(item => item.sequence)).toEqual([1])
    expect(last).toMatchObject({ total: 5, page: 3, anchor: latest.anchor })
    expect(await reader.query({})).toMatchObject({ total: 6, page: 1 })
    await rm(join(directory, 'application.1.jsonl'))
    expect(await reader.query({ anchor: latest.anchor! })).toMatchObject({ records: [], total: 0, anchorExpired: true })
  })

  it('combines category, severity, launch and metadata search without mixing task content', async () => {
    const { reader, write } = await fixture()
    await write([
      record(1, { event: 'rpc.request.failed', method: 'providers.list', level: 'error', scope: 'local-service', requestId: 'request-7' }),
      record(2, { event: 'rpc.request.completed', method: 'providers.list', requestId: 'request-7' }),
      record(3, { event: 'turn.failed', level: 'error', turnId: 'run-7:2' }),
    ])
    expect((await reader.query({ category: 'models', level: 'error', search: 'REQUEST-7' })).records.map(item => item.sequence)).toEqual([1])
    expect(await reader.query({ category: 'models', pageSize: 1, page: 2 })).toMatchObject({ total: 2, page: 2, records: [expect.objectContaining({ sequence: 1 })] })
    expect((await reader.query({ search: 'run-7:2' })).records.map(item => item.sequence)).toEqual([3])
    expect((await reader.query({ launch: 'launch-missing' })).records).toEqual([])
    expect(applicationLogCategory(record(1, { event: 'component.ready', component: 'runtime.database' }))).toBe('storage')
    expect(applicationLogCategory(record(1, { event: 'component.ready', component: 'runtime.scheduler' }))).toBe('automations')
    expect(applicationLogCategory(record(1, { event: 'process.output', scope: 'native-pet' }))).toBe('capabilities')
  })

  it('strips unsupported payloads and re-redacts safe text before display or search', async () => {
    const { reader, file } = await fixture()
    await writeFile(file, `${JSON.stringify({ ...record(1), prompt: 'fixture-private-prompt', toolArguments: { token: 'fixture-private-arguments' }, message: 'failed /home/fixture/config api_key=fixture-secret', error: { name: 'Error', message: 'Bearer fixture-secret', request: 'fixture-private-request' } })}\n`)
    const page = await reader.query({})
    expect(page.records[0]?.message).toBe('failed <home>/config api_key=<redacted>')
    expect(JSON.stringify(page)).not.toMatch(/fixture-secret|fixture-private|\/home\/fixture/)
    expect((await reader.query({ search: 'fixture-secret' })).records).toEqual([])
  })

  it('skips corrupt and oversized rows, waits for an append to finish and invalidates cached results', async () => {
    const { reader, file } = await fixture()
    await writeFile(file, `\ninvalid\n${JSON.stringify(record(1))}\n${'x'.repeat(20_000)}\n${JSON.stringify(record(2))}`)
    expect(await reader.query({})).toMatchObject({ records: [record(1)], total: 1, skippedRecords: 2 })
    await appendFile(file, '\n')
    expect(await reader.query({})).toMatchObject({ records: [record(2), record(1)], total: 2 })
    await writeFile(file, `${JSON.stringify(record(3))}\n`)
    expect(await reader.query({})).toMatchObject({ records: [record(3)], total: 1 })
  })

  it('only reads bounded recorder files, excluding conversation logs and symlinks', async () => {
    const { reader, directory, write } = await fixture()
    await write([record(1)])
    await write([record(2)], 'run.jsonl')
    await write([record(3)], 'application.16.jsonl')
    if (process.platform !== 'win32')
      await symlink(join(directory, 'run.jsonl'), join(directory, 'application.1.jsonl'))
    expect((await reader.query({ launch: 'all' })).records.map(item => item.sequence)).toEqual([1])
    await expect(reader.query({ launch: '../secret', pageSize: 101 })).rejects.toThrow()
  })

  it('pages a large history without returning or skipping matching records', async () => {
    const { reader, write } = await fixture()
    await write(Array.from({ length: 6000 }, (_, index) => record(index + 1, { event: 'turn.completed', turnId: `run-1:${index + 1}` })))
    const first = await reader.query({})
    expect(first.records).toHaveLength(100)
    expect(first.total).toBe(6000)
    expect(first.records[0]?.sequence).toBe(6000)
    const second = await reader.query({ page: 2, anchor: first.anchor! })
    expect(second.records.map(item => item.sequence)).toEqual(Array.from({ length: 100 }, (_, index) => 5900 - index))
    const last = await reader.query({ page: 60, anchor: first.anchor! })
    expect(last).toMatchObject({ total: 6000, page: 60 })
    expect(last.records.map(item => item.sequence)).toEqual(Array.from({ length: 100 }, (_, index) => 100 - index))
    expect((await reader.query({ search: '"turnId":"run-1:1"' })).records.map(item => item.sequence)).toEqual([1])
  })

  it('treats an absent log directory as empty', async () => {
    const { directory } = await fixture()
    const reader = new ApplicationLogReader(join(directory, 'missing'), 'launch-current', '/home/fixture')
    expect(await reader.query({ page: 4 })).toMatchObject({ records: [], launches: [], total: 0, page: 1, anchor: null, anchorExpired: false })
  })

  it('counts duplicate identities once and reflects removed retained files', async () => {
    const { directory, reader, write } = await fixture()
    await write([record(2), record(3), record(3)])
    await write([record(1), record(2)], 'application.1.jsonl')
    expect(await reader.query({ pageSize: 1, page: 3 })).toMatchObject({ total: 3, records: [record(1)] })
    await rm(join(directory, 'application.1.jsonl'))
    expect(await reader.query({ pageSize: 1, page: 3 })).toMatchObject({ total: 2, page: 2, records: [record(2)] })
  })
})
