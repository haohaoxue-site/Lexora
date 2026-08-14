import type { BashOperations } from '@earendil-works/pi-coding-agent'
import { spawn } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { createBashTool } from '@earendil-works/pi-coding-agent'

const BWRAP_PATH = '/usr/bin/bwrap'
const GIT_PATH = '/usr/bin/git'
const GIT_WRAPPER = `#!/bin/sh
command_name="$1"
case "$command_name" in
  diff|log|show|format-patch)
    shift
    exec /run/lexora/git-real -c core.fsmonitor=false -c diff.external= "$command_name" --no-ext-diff --no-textconv "$@"
    ;;
  *)
    exec /run/lexora/git-real -c core.fsmonitor=false -c diff.external= "$@"
    ;;
esac
`

export interface ShellSandboxAssets {
  gitWrapperPath: string
}

export interface ShellSandboxLaunch {
  args: string[]
  env: NodeJS.ProcessEnv
  executable: string
}

interface CreateShellSandboxLaunchInput {
  assets: ShellSandboxAssets
  canonicalRoot: string
  command: string
}

export async function prepareShellSandbox(agentDirectory: string): Promise<ShellSandboxAssets> {
  assertExecutable(BWRAP_PATH)
  assertExecutable(GIT_PATH)
  const directory = join(agentDirectory, 'sandbox')
  const gitWrapperPath = join(directory, 'git')
  await mkdir(directory, { mode: 0o700, recursive: true })
  await writeFile(gitWrapperPath, GIT_WRAPPER, { encoding: 'utf8', mode: 0o700 })
  await chmod(gitWrapperPath, 0o700)
  return { gitWrapperPath }
}

export function createSandboxedBashTool(
  canonicalRoot: string,
  assets: ShellSandboxAssets,
) {
  return createBashTool(canonicalRoot, {
    exposeSessionEnvironment: false,
    operations: createShellSandboxOperations(canonicalRoot, assets),
  })
}

export function createShellSandboxLaunch(
  input: CreateShellSandboxLaunchInput,
): ShellSandboxLaunch {
  const args = [
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
    '--dir',
    '/run',
    '--dir',
    '/run/lexora',
    '--ro-bind',
    GIT_PATH,
    '/run/lexora/git-real',
    '--ro-bind',
    input.assets.gitWrapperPath,
    GIT_PATH,
    '--bind',
    input.canonicalRoot,
    input.canonicalRoot,
    '--chdir',
    input.canonicalRoot,
    '--setenv',
    'HOME',
    '/tmp/lexora-home',
    '--setenv',
    'PATH',
    '/usr/bin:/bin',
    '--setenv',
    'GIT_CONFIG_NOSYSTEM',
    '1',
    '--setenv',
    'GIT_CONFIG_GLOBAL',
    '/dev/null',
    '--dir',
    '/tmp/lexora-home',
    '/bin/bash',
    '-lc',
    input.command,
  ]
  return {
    args,
    env: {
      HOME: '/tmp/lexora-home',
      LANG: process.env.LANG ?? 'C.UTF-8',
      PATH: '/usr/bin:/bin',
    },
    executable: BWRAP_PATH,
  }
}

function createShellSandboxOperations(
  canonicalRoot: string,
  assets: ShellSandboxAssets,
): BashOperations {
  return {
    exec(command, _cwd, options) {
      const launch = createShellSandboxLaunch({ assets, canonicalRoot, command })
      return new Promise((resolve, reject) => {
        const child = spawn(launch.executable, launch.args, {
          cwd: dirname(canonicalRoot),
          env: launch.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        let forceKill: NodeJS.Timeout | undefined
        let timeout: NodeJS.Timeout | undefined
        let termination: 'aborted' | 'timeout' | null = null
        let settled = false
        const terminate = (reason: 'aborted' | 'timeout') => {
          termination ??= reason
          child.kill('SIGTERM')
          forceKill ??= setTimeout(() => child.kill('SIGKILL'), 1_000)
          forceKill.unref()
        }
        const stop = () => terminate('aborted')
        const finish = (operation: () => void) => {
          if (settled)
            return
          settled = true
          if (timeout)
            clearTimeout(timeout)
          if (forceKill)
            clearTimeout(forceKill)
          options.signal?.removeEventListener('abort', stop)
          operation()
        }
        child.stdout.on('data', options.onData)
        child.stderr.on('data', options.onData)
        child.once('error', error => finish(() => reject(error)))
        child.once('close', code => finish(() => {
          if (termination === 'aborted') {
            reject(new Error('aborted'))
            return
          }
          if (termination === 'timeout') {
            reject(new Error(`timeout:${options.timeout}`))
            return
          }
          resolve({ exitCode: code })
        }))
        options.signal?.addEventListener('abort', stop, { once: true })
        if (options.signal?.aborted)
          stop()
        if (options.timeout) {
          timeout = setTimeout(() => {
            terminate('timeout')
          }, options.timeout * 1000)
          timeout.unref()
        }
      })
    },
  }
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
    throw new ShellSandboxUnavailableError({ cause: error })
  }
}

export class ShellSandboxUnavailableError extends Error {
  readonly code = 'SHELL_SANDBOX_UNAVAILABLE'

  constructor(options?: ErrorOptions) {
    super('Lexora Buddy shell sandbox is unavailable', options)
    this.name = 'ShellSandboxUnavailableError'
  }
}
