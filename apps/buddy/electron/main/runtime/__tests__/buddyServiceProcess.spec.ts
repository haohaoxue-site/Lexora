import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { createTemporaryDirectory } from '@buddy-tests/temporaryDirectories'
import { describe, expect, it } from 'vitest'
import { DesktopDiagnosticLogger } from '../../desktopDiagnostics'

import {
  forkBuddyServiceProcess,
} from '../buddyServiceProcess'

class FakeUtilityProcess extends EventEmitter {
  readonly stderr = new PassThrough()
  readonly pid = 42
  readonly sent: unknown[] = []

  kill(): boolean {
    return true
  }

  postMessage(message: unknown): void {
    this.sent.push(message)
  }
}

describe('buddyServiceProcess', () => {
  it('records stderr across chunks and drains trailing output after process exit', async () => {
    const directory = await createTemporaryDirectory('lexora-service-stderr-')
    const logger = new DesktopDiagnosticLogger({ directory, userHome: '/home/alice', appVersion: '0.3.0' })
    const process = new FakeUtilityProcess()
    forkBuddyServiceProcess({
      captureStderr: output => logger.captureOutput('local-service', output),
      forkProcess: () => process,
      mainModuleUrl: 'file:///workspace/buddy/index.js',
    })
    process.stderr.write('Authorization: Bea')
    process.emit('exit', 7)
    const closing = logger.close()
    process.stderr.end('rer fixture-secret')
    expect(await closing).toMatchObject({ written: 1, closeTimedOut: false })
    const record = JSON.parse(await readFile(join(directory, 'application.jsonl'), 'utf8'))
    expect(record).toMatchObject({ scope: 'local-service', message: 'Authorization: <redacted>' })
  })

  it('closes pending RPC when the utility process exits', async () => {
    const process = new FakeUtilityProcess()
    const handle = forkBuddyServiceProcess({
      forkProcess: () => process,
      mainModuleUrl: 'file:///workspace/apps/buddy/.output/build/electron/main/index.js',
    })
    const response = handle.peer.request('runtime.status', {})

    process.emit('exit', 7)

    await expect(response).rejects.toThrow('exited with code 7')
  })
})
