import type { WebContents } from 'electron'
import { EventEmitter } from 'node:events'
import { createTemporaryDirectory } from '@buddy-tests/temporaryDirectories'
import { describe, expect, it } from 'vitest'
import { DesktopDiagnosticLogger } from '../../desktopDiagnostics'
import { ApplicationLogReader } from '../../diagnostics/ApplicationLogReader'
import { describeProcessExit, observeRendererDiagnostics } from '../desktopProcessDiagnostics'

describe('renderer failure diagnostics', () => {
  it('roundtrips main frame, preload and exit evidence without URL, path or error payloads', async () => {
    const directory = await createTemporaryDirectory('buddy-process-diagnostics-')
    const logger = new DesktopDiagnosticLogger({ directory, userHome: '/fixture', appVersion: '0.6.0' })
    const contents = new EventEmitter()
    observeRendererDiagnostics(contents as WebContents, event => logger.record({ ...event, scope: 'desktop' }))
    contents.emit('did-fail-load', {}, -105, 'fixture-private-description', 'https://fixture-private/?token=secret', false)
    contents.emit('did-fail-load', {}, -105, 'fixture-private-description', 'https://fixture-private/?token=secret', true)
    contents.emit('preload-error', {}, '/fixture-private/preload.js', Object.assign(new Error('fixture-private-stack'), { code: 'ENOENT' }))
    contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: -1073741819 })
    contents.emit('render-process-gone', {}, { reason: 'clean-exit', exitCode: 0 })
    await logger.close()
    const records = (await new ApplicationLogReader(directory, logger.launchId, '/fixture').query({})).records.reverse()
    expect(records).toMatchObject([
      { event: 'renderer.load_failed', loadFailure: { stage: 'main_frame', code: -105 } },
      { event: 'renderer.preload_failed', loadFailure: { stage: 'preload' }, errorCode: 'ENOENT' },
      { event: 'renderer.exited_abnormally', processExit: { type: 'renderer', reason: 'crashed', code: -1073741819 } },
      { event: 'renderer.exited', level: 'info', processExit: { reason: 'clean-exit', code: 0 } },
    ])
    expect(JSON.stringify(records)).not.toMatch(/fixture-private|secret/)
    expect(describeProcessExit('gpu', { reason: 'future-private-reason', exitCode: 42 })).toEqual({ type: 'gpu', reason: 'unknown', code: 42 })
  })
})
