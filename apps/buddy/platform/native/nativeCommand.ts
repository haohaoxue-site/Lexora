import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'

export interface NativeCommandResult {
  code: number | null
  stdout: Buffer
  stderr: string
}

export function runNativeCommand(
  executable: string,
  args: string[],
  input: unknown,
  options: { env: NodeJS.ProcessEnv, maxBytes?: number, signal?: AbortSignal, timeoutMs?: number },
): Promise<NativeCommandResult> {
  return new Promise((resolve, reject) => {
    options.signal?.throwIfAborted()
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: options.env,
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let failure: Error | undefined
    let bytes = 0
    const stop = (error: Error) => {
      failure ??= error
      child.kill('SIGKILL')
    }
    const abort = () => stop(new Error('Native host operation cancelled', { cause: options.signal?.reason }))
    const timeout = setTimeout(() => stop(new Error('Native host operation timed out')), options.timeoutMs ?? 30_000)
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted)
      abort()
    const collect = (chunks: Buffer[]) => (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > (options.maxBytes ?? 1024 * 1024))
        stop(new Error('Native host output limit exceeded'))
      else
        chunks.push(chunk)
    }
    child.stdout.on('data', collect(stdout))
    child.stderr.on('data', collect(stderr))
    child.once('error', (error) => {
      failure ??= error
    })
    child.stdin.on('error', (error) => {
      failure ??= error
    })
    child.once('close', (code) => {
      clearTimeout(timeout)
      options.signal?.removeEventListener('abort', abort)
      if (failure)
        reject(failure)
      else
        resolve({ code, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr).toString('utf8') })
    })
    child.stdin.end(JSON.stringify(input))
  })
}
