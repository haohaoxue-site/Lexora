import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'

import {
  forkBuddyServiceProcess,
} from '../buddyServiceProcess'

class FakeUtilityProcess extends EventEmitter {
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
