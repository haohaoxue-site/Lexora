import type { SandboxEnvironmentStatus } from '../../shared/permissions/shellSandbox'
import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { ShellSandboxError } from '../../shared/permissions/shellSandbox'
import shellSandbox from '../native/shellSandbox.json'
import { checkWindowsSandbox } from './windowsSandbox'

const execFileAsync = promisify(execFile)

export async function resolveSandboxDependencies(options: { sandboxDirectory: string, searchDirectory: string }, signal?: AbortSignal) {
  if (process.platform !== 'linux' || process.arch !== 'x64')
    throw new ShellSandboxError('SANDBOX_UNAVAILABLE')
  const bwrap = join(options.sandboxDirectory, 'bwrap')
  const socat = '/usr/bin/socat'
  const rg = join(options.searchDirectory, 'rg')
  const srtRoot = dirname(dirname(fileURLToPath(import.meta.resolve('@anthropic-ai/sandbox-runtime')))).replace(/\.asar(?=\/)/, '.asar.unpacked')
  const seccomp = join(srtRoot, 'vendor/seccomp/x64/apply-seccomp')
  await Promise.all([bwrap, socat, rg, seccomp].map(path => access(path, constants.X_OK)))
  const metadata = await stat(bwrap)
  const version = await execFileAsync(bwrap, ['--version'], { signal, timeout: 5_000, env: { LANG: 'C' } })
  if (version.stdout.trim() !== `bubblewrap ${shellSandbox.version}` || (metadata.mode & 0o6000) !== 0)
    throw new ShellSandboxError('SANDBOX_UNAVAILABLE')
  return { bwrap, socat, rg, srtRoot, seccomp }
}

export async function checkSandboxEnvironment(options: { sandboxDirectory: string, searchDirectory: string, windowsSandbox?: string }): Promise<SandboxEnvironmentStatus> {
  if (process.platform === 'win32')
    return checkWindowsSandbox(options.windowsSandbox)
  if (process.platform !== 'linux')
    return 'unsupported'
  try {
    const { bwrap } = await resolveSandboxDependencies(options)
    await execFileAsync(bwrap, ['--unshare-all', '--die-with-parent', '--new-session', '--ro-bind', '/', '/', '--proc', '/proc', '--dev', '/dev', '--chdir', '/', '--', '/usr/bin/true'], {
      cwd: '/',
      env: { LANG: 'C' },
      timeout: 5_000,
    })
    return 'available'
  }
  catch {
    return 'unavailable'
  }
}
