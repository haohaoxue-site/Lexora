import { execFile } from 'node:child_process'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { createTemporaryDirectory } from '@buddy-tests/temporaryDirectories'
import { describe, expect, it } from 'vitest'
import { createBuddyServiceEnvironment } from '../buddyServiceEnvironment'

const executeFile = promisify(execFile)
const probe = fileURLToPath(new URL('./fixtures/piAgentDirectoryProbe.mjs', import.meta.url))

describe('buddy Service Pi process environment', () => {
  it('resolves Pi global resources inside Buddy before the SDK is imported', async () => {
    const root = await createTemporaryDirectory('buddy-pi-environment-')
    const buddyHome = join(root, 'buddy')
    const { stdout } = await executeFile(process.execPath, [probe], {
      env: createBuddyServiceEnvironment({ PI_CODING_AGENT_DIR: join(root, 'unrelated-pi') }, buddyHome),
      timeout: 5000,
    })
    expect(JSON.parse(stdout)).toEqual({
      agentDirectory: join(buddyHome, 'agent'),
      binaryDirectory: join(buddyHome, 'agent', 'bin'),
    })
  })
})
