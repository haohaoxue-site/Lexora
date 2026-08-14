import type {
  EditOperations,
  FindOperations,
  GrepToolInput,
  LsOperations,
  ReadOperations,
  ToolDefinition,
  WriteOperations,
} from '@earendil-works/pi-coding-agent'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { basename, dirname, join, matchesGlob, relative, sep } from 'node:path'
import process from 'node:process'
import {
  createEditToolDefinition,
  createFindToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  defineTool,
} from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'

const BWRAP_PATH = '/usr/bin/bwrap'
const MAX_PROCESS_OUTPUT_BYTES = 8 * 1024 * 1024
const DEFAULT_SEARCH_LIMIT = 100
const IMAGE_MIME_TYPES = new Set([
  'image/bmp',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])

const grepSchema = Type.Object({
  pattern: Type.String({ description: 'Regex pattern to search for in file contents' }),
  path: Type.Optional(Type.String({ description: 'Directory or file to search' })),
  glob: Type.Optional(Type.String({ description: 'Only search files matching this glob pattern' })),
  ignoreCase: Type.Optional(Type.Boolean({ description: 'Perform case-insensitive matching' })),
  literal: Type.Optional(Type.Boolean({ description: 'Treat the pattern as a literal string' })),
  context: Type.Optional(Type.Number({ description: 'Lines of context before and after each match' })),
  limit: Type.Optional(Type.Number({ description: 'Maximum number of matching lines' })),
})

interface SandboxedProcessResult {
  exitCode: number | null
  stderr: Buffer
  stdout: Buffer
}

export function createSandboxedFileTools(canonicalRoot: string): ToolDefinition[] {
  const operations = createFileOperations(canonicalRoot)
  return [
    defineTool(createReadToolDefinition(canonicalRoot, {
      operations: {
        access: operations.access,
        detectImageMimeType: operations.detectImageMimeType,
        readFile: operations.readFile,
      },
    })),
    defineTool(createWriteToolDefinition(canonicalRoot, {
      operations: {
        mkdir: operations.mkdir,
        writeFile: operations.writeFile,
      },
    })),
    defineTool(createEditToolDefinition(canonicalRoot, {
      operations: {
        access: operations.access,
        readFile: operations.readFile,
        writeFile: operations.writeFile,
      },
    })),
    defineTool(createSandboxedGrepTool(canonicalRoot)),
    defineTool(createFindToolDefinition(canonicalRoot, {
      operations: {
        exists: operations.exists,
        glob: operations.glob,
      },
    })),
    defineTool(createLsToolDefinition(canonicalRoot, {
      operations: {
        exists: operations.exists,
        readdir: operations.readdir,
        stat: operations.stat,
      },
    })),
  ]
}

export async function readSandboxedFile(canonicalRoot: string, path: string): Promise<Buffer> {
  const result = await runSandboxedProcess(canonicalRoot, '/usr/bin/cat', ['--', path])
  assertSuccess(result)
  return result.stdout
}

function createFileOperations(canonicalRoot: string): ReadOperations
  & WriteOperations
  & EditOperations
  & FindOperations
  & LsOperations
  & { detectImageMimeType: NonNullable<ReadOperations['detectImageMimeType']> } {
  const run = (
    executable: string,
    args: readonly string[],
    options: { input?: string } = {},
  ) => runSandboxedProcess(canonicalRoot, executable, args, options)
  const directoryEntryTypes = new Map<string, boolean>()

  return {
    async access(path) {
      const result = await run('/usr/bin/test', ['-r', path])
      assertSuccess(result)
    },
    async detectImageMimeType(path) {
      const result = await run('/usr/bin/file', ['--brief', '--mime-type', '--', path])
      if (result.exitCode !== 0)
        return undefined
      const mimeType = result.stdout.toString('utf8').trim()
      return IMAGE_MIME_TYPES.has(mimeType) ? mimeType : undefined
    },
    async exists(path) {
      const result = await run('/usr/bin/test', ['-e', path])
      if (result.exitCode === 0)
        return true
      if (result.exitCode === 1)
        return false
      throw createProcessError(result)
    },
    async glob(pattern, cwd, options) {
      const gitWorkTree = await isGitWorkTree(canonicalRoot, cwd)
      let paths: string[]
      if (gitWorkTree) {
        const result = await run('/usr/bin/git', [
          '-C',
          cwd,
          '-c',
          'core.fsmonitor=false',
          'ls-files',
          '--cached',
          '--others',
          '--exclude-standard',
          '-z',
        ])
        assertSuccess(result)
        paths = splitNullTerminated(result.stdout).map(path => join(cwd, path))
      }
      else {
        const result = await run('/usr/bin/find', [
          cwd,
          '-type',
          'd',
          '(',
          '-name',
          '.git',
          '-o',
          '-name',
          'node_modules',
          ')',
          '-prune',
          '-o',
          '-type',
          'f',
          '-print0',
        ])
        assertSuccess(result)
        paths = splitNullTerminated(result.stdout)
      }
      return paths
        .filter(path => matchesSearchPattern(relative(cwd, path), pattern))
        .slice(0, options.limit)
    },
    async mkdir(path) {
      const result = await run('/usr/bin/mkdir', ['--parents', '--', path])
      assertSuccess(result)
    },
    async readFile(path) {
      return readSandboxedFile(canonicalRoot, path)
    },
    async readdir(path) {
      const result = await run('/usr/bin/find', [
        path,
        '-mindepth',
        '1',
        '-maxdepth',
        '1',
        '-printf',
        String.raw`%f\0%Y\0`,
      ])
      assertSuccess(result)
      const fields = splitNullTerminated(result.stdout)
      const entries: string[] = []
      for (let index = 0; index < fields.length; index += 2) {
        const name = fields[index]
        const type = fields[index + 1]
        if (!name || !type)
          continue
        entries.push(name)
        directoryEntryTypes.set(join(path, name), type === 'd')
      }
      return entries
    },
    async stat(path) {
      const cached = directoryEntryTypes.get(path)
      if (cached !== undefined) {
        directoryEntryTypes.delete(path)
        return { isDirectory: () => cached }
      }
      const result = await run('/usr/bin/test', ['-d', path])
      if (result.exitCode !== 0 && result.exitCode !== 1)
        throw createProcessError(result)
      return { isDirectory: () => result.exitCode === 0 }
    },
    async writeFile(path, content) {
      const result = await run('/usr/bin/dd', [`of=${path}`, 'status=none'], { input: content })
      assertSuccess(result)
    },
  }
}

function createSandboxedGrepTool(canonicalRoot: string): ToolDefinition<typeof grepSchema> {
  return {
    name: 'grep',
    label: 'grep',
    description: 'Search file contents inside the authorized directory. Respects Git ignore rules and excludes internal metadata.',
    promptSnippet: 'Search file contents',
    parameters: grepSchema,
    async execute(_toolCallId, input: GrepToolInput, signal) {
      const searchPath = resolveSandboxPath(canonicalRoot, input.path ?? '.')
      const gitWorkTree = await isGitWorkTree(canonicalRoot, searchPath, signal)
      const executable = gitWorkTree ? '/usr/bin/git' : '/usr/bin/grep'
      const args = gitWorkTree
        ? ['-C', searchPath, '-c', 'core.fsmonitor=false', 'grep', '--untracked', '--line-number', '--no-color', '-I']
        : [
            '--recursive',
            '--line-number',
            '--with-filename',
            '--binary-files=without-match',
            '--exclude-dir=.git',
            '--exclude-dir=node_modules',
          ]
      if (input.ignoreCase)
        args.push('--ignore-case')
      if (input.literal)
        args.push('--fixed-strings')
      if (input.glob && !gitWorkTree)
        args.push(`--include=${input.glob}`)
      if (input.context && input.context > 0)
        args.push(`--context=${Math.floor(input.context)}`)
      if (gitWorkTree) {
        args.push('-e', input.pattern, '--', gitPathspec(input.glob))
      }
      else {
        args.push('--', input.pattern, searchPath)
      }
      const result = await runSandboxedProcess(canonicalRoot, executable, args, { signal })
      if (result.exitCode === 1) {
        return {
          content: [{ type: 'text', text: 'No matches found' }],
          details: undefined,
        }
      }
      assertSuccess(result)
      const limit = Math.max(1, input.limit ?? DEFAULT_SEARCH_LIMIT)
      const lines = result.stdout.toString('utf8').split('\n').filter(Boolean)
      const limited = lines.slice(0, limit).map(line => formatSearchLine(canonicalRoot, line))
      if (lines.length > limit)
        limited.push('', `[Truncated: ${limit} matches limit reached]`)
      return {
        content: [{ type: 'text', text: limited.join('\n') }],
        details: undefined,
      }
    },
  }
}

async function isGitWorkTree(
  canonicalRoot: string,
  searchPath: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const result = await runSandboxedProcess(canonicalRoot, '/usr/bin/git', [
    '-C',
    searchPath,
    '-c',
    'core.fsmonitor=false',
    'rev-parse',
    '--is-inside-work-tree',
  ], { signal })
  return result.exitCode === 0 && result.stdout.toString('utf8').trim() === 'true'
}

function gitPathspec(glob: string | undefined): string {
  if (!glob)
    return '.'
  return `:(glob)${glob.includes('/') ? glob : `**/${glob}`}`
}

function resolveSandboxPath(canonicalRoot: string, path: string): string {
  return path.startsWith(sep) ? path : `${canonicalRoot}${sep}${path}`
}

function formatSearchLine(canonicalRoot: string, line: string): string {
  const prefix = `${canonicalRoot}${sep}`
  return line.startsWith(prefix) ? line.slice(prefix.length) : line
}

function matchesSearchPattern(path: string, pattern: string): boolean {
  const normalized = path.split(sep).join('/')
  return matchesGlob(normalized, pattern) || matchesGlob(basename(normalized), pattern)
}

function splitNullTerminated(buffer: Buffer): string[] {
  return buffer.toString('utf8').split('\0').filter(Boolean)
}

async function runSandboxedProcess(
  canonicalRoot: string,
  executable: string,
  args: readonly string[],
  options: { input?: string, signal?: AbortSignal } = {},
): Promise<SandboxedProcessResult> {
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
    '--bind',
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
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        HOME: '/tmp/lexora-home',
        LANG: process.env.LANG ?? 'C.UTF-8',
        PATH: '/usr/bin:/bin',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let outputBytes = 0
    let settled = false
    const stop = () => child.kill('SIGTERM')
    const finish = (operation: () => void) => {
      if (settled)
        return
      settled = true
      options.signal?.removeEventListener('abort', stop)
      operation()
    }
    const collect = (target: Buffer[]) => (chunk: Buffer) => {
      outputBytes += chunk.length
      if (outputBytes > MAX_PROCESS_OUTPUT_BYTES) {
        stop()
        finish(() => reject(new FileSandboxError('FILE_SANDBOX_OUTPUT_LIMIT')))
        return
      }
      target.push(chunk)
    }
    child.stdout.on('data', collect(stdout))
    child.stderr.on('data', collect(stderr))
    child.once('error', error => finish(() => reject(new FileSandboxError('FILE_SANDBOX_UNAVAILABLE', { cause: error }))))
    child.once('close', exitCode => finish(() => {
      if (options.signal?.aborted) {
        reject(new Error('Operation aborted'))
        return
      }
      resolve({
        exitCode,
        stderr: Buffer.concat(stderr),
        stdout: Buffer.concat(stdout),
      })
    }))
    options.signal?.addEventListener('abort', stop, { once: true })
    if (options.signal?.aborted)
      stop()
    if (options.input === undefined)
      child.stdin.end()
    else
      child.stdin.end(options.input, 'utf8')
  })
}

function assertSuccess(result: SandboxedProcessResult): void {
  if (result.exitCode !== 0)
    throw createProcessError(result)
}

function createProcessError(result: SandboxedProcessResult): FileSandboxError {
  const message = result.stderr.toString('utf8').trim()
  return new FileSandboxError('FILE_SANDBOX_OPERATION_FAILED', undefined, message)
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
    throw new FileSandboxError('FILE_SANDBOX_UNAVAILABLE', { cause: error })
  }
}

export class FileSandboxError extends Error {
  readonly code: 'FILE_SANDBOX_OPERATION_FAILED' | 'FILE_SANDBOX_OUTPUT_LIMIT' | 'FILE_SANDBOX_UNAVAILABLE'

  constructor(
    code: FileSandboxError['code'],
    options?: ErrorOptions,
    detail?: string,
  ) {
    super(detail ? `Lexora Buddy file sandbox failed: ${detail}` : 'Lexora Buddy file sandbox failed', options)
    this.name = 'FileSandboxError'
    this.code = code
  }
}
