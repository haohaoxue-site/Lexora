import { spawn } from 'node:child_process'
import { constants, mkdtempSync } from 'node:fs'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'

import { writeError, writeOutput } from '../../shared/cli-output.mjs'
import { resolveBuddyOutputPaths } from '../release/output-paths.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')
const outputPaths = resolveBuddyOutputPaths(repoRoot)
const guiRunner = process.env.LEXORA_GUI_SMOKE_RUNNER ?? 'xvfb-run'
const RECOVERY_FIXTURE = Object.freeze({
  backupId: 'buddy-20260816120000000-deadbeef',
  expectedAction: 'restored_previous_data',
  operationId: '4a50a3f3-e077-4f39-936a-4e7d29da5a0f',
})

async function main() {
  const recoveryOnly = process.argv.includes('--recovery-only')
  const desktopPath = resolve(
    process.env.LEXORA_DESKTOP_EXECUTABLE_PATH
    ?? resolve(outputPaths.package.desktop, 'linux-unpacked/lexora-buddy'),
  )
  const binaryPath = resolve(
    process.env.LEXORA_BUDDY_PET_PATH
    ?? resolve(outputPaths.build.nativePet, 'release/lexora-buddy-pet'),
  )
  const smokeRoot = mkdtempSync(join(tmpdir(), 'lexora-desktop-smoke-'))
  try {
    const recoveryFixture = await prepareDesktopRecoverySmokeFixture(smokeRoot)
    const smokeEnv = {
      ...process.env,
      LEXORA_BUDDY_PET_SOCKET: join(smokeRoot, 'native-pet.sock'),
      LEXORA_DESKTOP_SMOKE_EXPECT_RECOVERY: recoveryFixture.expectedAction,
      LEXORA_HOME: recoveryFixture.lexoraHome,
    }

    await runDesktopSmoke(desktopPath, smokeEnv)
    await verifyDesktopRecoverySmokeResult(recoveryFixture)
    if (!recoveryOnly)
      await runNativePetSmoke(binaryPath, 12_000, smokeEnv)
    writeOutput(recoveryOnly
      ? 'Lexora Buddy Desktop recovery GUI smoke passed'
      : 'Lexora Buddy Desktop recovery and standalone pet GUI smoke passed')
  }
  finally {
    await rm(smokeRoot, { force: true, recursive: true })
  }
}

export async function prepareDesktopRecoverySmokeFixture(smokeRoot) {
  const lexoraHome = join(smokeRoot, 'home')
  const rollbackPath = join(lexoraHome, '.buddy.restore-rollback')
  const timestamp = '2026-08-16T12:00:00.000Z'
  await mkdir(rollbackPath, { mode: 0o700, recursive: true })
  await writeFile(join(lexoraHome, 'config.toml'), '[pet]\nenabled = false\n', { mode: 0o600 })
  await writeFile(join(rollbackPath, 'recovery-marker.txt'), 'rollback-data\n', { mode: 0o600 })
  await writeFile(
    join(lexoraHome, '.buddy.restore-journal.json'),
    `${JSON.stringify({
      backupId: RECOVERY_FIXTURE.backupId,
      format: 'lexora-buddy-restore-journal',
      operationId: RECOVERY_FIXTURE.operationId,
      phase: 'current_moved',
      startedAt: timestamp,
      updatedAt: timestamp,
      version: 1,
    })}\n`,
    { mode: 0o600 },
  )
  return {
    expectedAction: RECOVERY_FIXTURE.expectedAction,
    lexoraHome,
  }
}

export async function verifyDesktopRecoverySmokeResult({ expectedAction, lexoraHome }) {
  const pendingRecoveryPaths = [
    ['restore journal', join(lexoraHome, '.buddy.restore-journal.json')],
    ['restore rollback', join(lexoraHome, '.buddy.restore-rollback')],
    ['restore staging', join(lexoraHome, '.buddy.restore-staging')],
  ]
  for (const [label, path] of pendingRecoveryPaths) {
    if (await pathExists(path))
      throw new Error(`Desktop recovery smoke failed: ${label} still exists`)
  }

  const marker = (await readFile(
    join(lexoraHome, 'buddy', 'recovery-marker.txt'),
    'utf8',
  )).trim()
  if (marker !== 'rollback-data')
    throw new Error('Desktop recovery smoke failed: rollback data was not restored')

  const receipt = JSON.parse(await readFile(
    join(lexoraHome, 'backups', 'buddy', '.last-data-recovery.json'),
    'utf8',
  ))
  if (
    receipt.action !== expectedAction
    || receipt.backupId !== RECOVERY_FIXTURE.backupId
    || receipt.format !== 'lexora-buddy-data-recovery-receipt'
    || receipt.operationId !== RECOVERY_FIXTURE.operationId
    || receipt.version !== 1
    || typeof receipt.completedAt !== 'string'
    || !Number.isFinite(Date.parse(receipt.completedAt))
  ) {
    throw new Error('Desktop recovery smoke failed: recovery receipt does not match the fixture')
  }

  return { action: receipt.action, marker }
}

export function runDesktopSmoke(executablePath, env, timeoutMs = 30_000) {
  return new Promise((resolveSmoke, rejectSmoke) => {
    const child = spawnGui(executablePath, {
      ...env,
      LEXORA_DESKTOP_SMOKE_TEST: '1',
    }, env.LEXORA_GUI_SMOKE_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      rejectSmoke(new Error(`Desktop smoke did not exit within ${timeoutMs}ms`))
    }, timeoutMs)

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-8_192)
    })
    child.on('error', (error) => {
      clearTimeout(timeout)
      rejectSmoke(error)
    })
    child.on('exit', (code, signal) => {
      clearTimeout(timeout)
      child.stdout.destroy()
      child.stderr.destroy()
      if (code === 0) {
        resolveSmoke()
        return
      }

      rejectSmoke(new Error(`Desktop smoke failed: ${signal ?? code}; ${stderr.trim()}`))
    })
  })
}

export function runNativePetSmoke(runtimePath, timeoutMs = 12_000, env = process.env) {
  return new Promise((resolveSmoke, rejectSmoke) => {
    const child = spawnGui(runtimePath, env, ['--native-pet'])
    let settled = false
    let ready = false
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      finish(new Error(`native pet did not become ready within ${timeoutMs}ms`))
    }, timeoutMs)

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout = `${stdout}${chunk}`.slice(-8_192)
      if (stdout.includes('event:ready') && !ready) {
        ready = true
        child.kill('SIGTERM')
      }
    })
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-2_048)
    })
    child.on('error', finish)
    child.on('exit', (code, signal) => {
      if (!settled) {
        finish(ready
          ? undefined
          : new Error(`native pet exited before ready: ${signal ?? code}; ${stderr.trim()}`))
      }
    })

    function finish(error) {
      if (settled)
        return

      settled = true
      clearTimeout(timeout)
      if (!ready)
        child.kill('SIGTERM')
      if (error)
        rejectSmoke(error)
      else
        resolveSmoke()
    }
  })
}

function spawnGui(executablePath, env, args = []) {
  const command = guiRunner === 'direct' ? executablePath : guiRunner
  const commandArgs = guiRunner === 'direct'
    ? args
    : ['-a', executablePath, ...args]

  return spawn(command, commandArgs, {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

async function pathExists(path) {
  try {
    await access(path, constants.F_OK)
    return true
  }
  catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT')
      return false
    throw error
  }
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  void main().catch((error) => {
    writeError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
