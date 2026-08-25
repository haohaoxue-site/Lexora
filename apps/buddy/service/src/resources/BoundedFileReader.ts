import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { dirname } from 'node:path'
import process from 'node:process'

const BWRAP_PATH = '/usr/bin/bwrap'
const MAX_PROCESS_OUTPUT_BYTES = 8 * 1024 * 1024

interface BoundedProcessResult {
  exitCode: number | null
  stderr: Buffer
  stdout: Buffer
}

export async function readBoundedFile(canonicalRoot: string, path: string): Promise<Buffer> {
  const result = await runBoundedProcess(canonicalRoot, '/usr/bin/cat', ['--', path])
  if (result.exitCode !== 0) {
    const detail = result.stderr.toString('utf8').trim()
    throw new BoundedFileReadError('BOUNDED_FILE_READ_FAILED', undefined, detail)
  }
  return result.stdout
}

async function runBoundedProcess(
  canonicalRoot: string,
  executable: string,
  args: readonly string[],
): Promise<BoundedProcessResult> {
  assertExecutable(BWRAP_PATH)
  const sandboxArgs = [
    '--die-with-parent',
    '--new-session',
    '--unshare-all',
    '--unshare-net',
    '--unshare-user',
    '--disable-userns',
    '--cap-drop',
    'ALL',
    '--ro-bind',
    '/usr',
    '/usr',
    ...optionalReadOnlyBind('/bin'),
    ...optionalReadOnlyBind('/lib'),
    ...optionalReadOnlyBind('/lib64'),
    '--proc',
    '/proc',
    '--dev',
    '/dev',
    '--tmpfs',
    '/tmp',
    '--ro-bind',
    canonicalRoot,
    canonicalRoot,
    '--chdir',
    canonicalRoot,
    '--setenv',
    'HOME',
    '/tmp/lexora-home',
    '--setenv',
    'PATH',
    '/usr/bin:/bin',
    '--dir',
    '/tmp/lexora-home',
    executable,
    ...args,
  ]
  return new Promise((resolve, reject) => {
    const child = spawn(BWRAP_PATH, sandboxArgs, {
      cwd: dirname(canonicalRoot),
      env: {
        HOME: '/tmp/lexora-home',
        LANG: process.env.LANG ?? 'C.UTF-8',
        PATH: '/usr/bin:/bin',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let outputBytes = 0
    let settled = false
    const finish = (operation: () => void) => {
      if (settled)
        return
      settled = true
      operation()
    }
    const collect = (target: Buffer[]) => (chunk: Buffer) => {
      outputBytes += chunk.length
      if (outputBytes > MAX_PROCESS_OUTPUT_BYTES) {
        child.kill('SIGTERM')
        finish(() => reject(new BoundedFileReadError('BOUNDED_FILE_OUTPUT_LIMIT')))
        return
      }
      target.push(chunk)
    }
    child.stdout.on('data', collect(stdout))
    child.stderr.on('data', collect(stderr))
    child.once('error', error => finish(() => reject(
      new BoundedFileReadError('BOUNDED_FILE_READER_UNAVAILABLE', { cause: error }),
    )))
    child.once('close', exitCode => finish(() => resolve({
      exitCode,
      stderr: Buffer.concat(stderr),
      stdout: Buffer.concat(stdout),
    })))
  })
}

function optionalReadOnlyBind(path: string): string[] {
  try {
    accessSync(path, constants.R_OK)
    return ['--ro-bind', path, path]
  }
  catch {
    return []
  }
}

function assertExecutable(path: string): void {
  try {
    accessSync(path, constants.X_OK)
  }
  catch (error) {
    throw new BoundedFileReadError('BOUNDED_FILE_READER_UNAVAILABLE', { cause: error })
  }
}

export class BoundedFileReadError extends Error {
  readonly code:
    | 'BOUNDED_FILE_OUTPUT_LIMIT'
    | 'BOUNDED_FILE_READER_UNAVAILABLE'
    | 'BOUNDED_FILE_READ_FAILED'

  constructor(
    code: BoundedFileReadError['code'],
    options?: ErrorOptions,
    detail?: string,
  ) {
    super(detail ? `Lexora Buddy could not read a bounded file: ${detail}` : 'Lexora Buddy could not read a bounded file', options)
    this.name = 'BoundedFileReadError'
    this.code = code
  }
}
