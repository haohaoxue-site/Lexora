import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { createTemporaryDirectory } from '@buddy-tests/temporaryDirectories'
import { describe, expect, it } from 'vitest'
import { createBuddyServiceEnvironment, resolveBuddySearchToolsDirectory } from '../buddyServiceEnvironment'

const executeFile = promisify(execFile)
const probe = fileURLToPath(new URL('./fixtures/piSearchProbe.mjs', import.meta.url))
const bundledDirectory = resolveBuddySearchToolsDirectory({
  appPath: fileURLToPath(new URL('../../../../', import.meta.url)),
  isPackaged: false,
  resourcesPath: '',
})

describe('pi native search dependency behavior', () => {
  it('uses both bundled binaries with empty PATH, stale cache and no network', async () => {
    const result = await runProbe('bundled')
    expect(result.networkAttempts).toBe(0)
    expect(result.results.find).toMatchObject({ status: 'ok', text: expect.stringContaining('说明.txt') })
    expect(result.results.grep).toMatchObject({ status: 'ok', text: expect.stringContaining('说明.txt:1: 固定夹具') })
  })

  it('does not fall back to PATH or downloads when bundled tools are missing', async () => {
    const result = await runProbe('bundled-missing')
    expect(result.networkAttempts).toBe(0)
    expect(result.results.find).toMatchObject({ status: 'error', error: expect.stringContaining('Bundled tool is missing:') })
    expect(result.results.grep).toMatchObject({ status: 'error', error: expect.stringContaining('Bundled tool is missing:') })
    expect(result.results.read).toMatchObject({ status: 'ok' })
  })
})

async function runProbe(mode: 'bundled-missing' | 'bundled') {
  const root = await createTemporaryDirectory('buddy-search-')
  const buddyHome = join(root, 'buddy')
  const agentDirectory = join(buddyHome, 'agent')
  const workspace = join(root, '中文 空格')
  await mkdir(workspace)
  await writeFile(join(workspace, '说明.txt'), '固定夹具\nordinary fixture\n')
  if (mode === 'bundled') {
    const cache = join(agentDirectory, 'bin')
    await mkdir(cache, { recursive: true })
    for (const name of process.platform === 'win32' ? ['fd.exe', 'rg.exe'] : ['fd', 'rg'])
      await writeFile(join(cache, name), 'stale binary fixture')
  }
  const environment = createBuddyServiceEnvironment(process.env, buddyHome)
  const { stdout } = await executeFile(process.execPath, [probe, agentDirectory, workspace], {
    cwd: workspace,
    env: {
      ...environment,
      PATH: mode === 'bundled-missing' ? environment.PATH : '',
      PI_OFFLINE: mode === 'bundled-missing' ? '0' : '1',
      PI_TOOLS_DIR: mode === 'bundled-missing' ? join(root, 'missing-bundle') : bundledDirectory,
    },
    timeout: 5000,
  })
  return JSON.parse(stdout) as {
    networkAttempts: number
    results: Record<string, { status: string, text?: string, error?: string }>
  }
}
