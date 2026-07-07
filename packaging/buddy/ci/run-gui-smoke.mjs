import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { writeOutput } from '../../shared/cli-output.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

export function createBuddyGuiSmokePlan(options) {
  const xvfbRunPath = options.xvfbRunPath
  const required = options.required ?? false

  if (!xvfbRunPath) {
    const reason = 'xvfb-run is not available; GUI smoke was skipped to avoid using the real desktop display'

    if (required)
      throw new Error(`xvfb-run is required for Buddy GUI smoke: ${reason}`)

    return {
      reason,
      status: 'skipped',
    }
  }

  return {
    args: [
      '--auto-servernum',
      '--server-args=-screen 0 1280x800x24',
      options.binaryPath,
      '--buddy-window-smoke-check',
      '--buddy-window-smoke-check-data-dir',
      options.smokeDataDir,
    ],
    command: xvfbRunPath,
    status: 'run',
  }
}

export function runBuddyGuiSmokeCheck(options = {}) {
  const required = options.required ?? process.argv.includes('--required')
  const binaryPath = options.binaryPath ?? resolve(
    repoRoot,
    'apps/buddy/src-tauri/target/release/lexora-buddy',
  )
  const shouldCleanupSmokeDataDir = !options.smokeDataDir
  const smokeDataDir = options.smokeDataDir ?? mkdtempSync(
    resolve(tmpdir(), 'lexora-buddy-gui-smoke-'),
  )
  const xvfbRunPath = options.xvfbRunPath ?? findExecutable('xvfb-run')

  try {
    const plan = createBuddyGuiSmokePlan({
      binaryPath,
      required,
      smokeDataDir,
      xvfbRunPath,
    })

    if (plan.status === 'skipped') {
      writeOutput(plan.reason)
      return plan
    }

    const output = execFileSync(plan.command, plan.args, {
      cwd: repoRoot,
      encoding: 'utf8',
      env: options.env ?? process.env,
    })
    const report = parseBuddyGuiSmokeReport(output)

    if (!report.ok)
      throw new Error('Buddy GUI smoke did not report ok=true')

    writeOutput(`Buddy GUI smoke passed: window=${report.windowLabel}`)

    return {
      ...plan,
      report,
    }
  }
  finally {
    if (shouldCleanupSmokeDataDir)
      rmSync(smokeDataDir, { force: true, recursive: true })
  }
}

export function parseBuddyGuiSmokeReport(output) {
  const jsonLine = output
    .split('\n')
    .map(line => line.trim())
    .find(line => line.startsWith('{') && line.endsWith('}'))

  if (!jsonLine)
    throw new Error('Buddy GUI smoke did not produce a JSON report')

  return JSON.parse(jsonLine)
}

function findExecutable(name) {
  const result = spawnSync('which', [name], { encoding: 'utf8' })

  if (result.status !== 0)
    return null

  return result.stdout.trim() || null
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  runBuddyGuiSmokeCheck()
