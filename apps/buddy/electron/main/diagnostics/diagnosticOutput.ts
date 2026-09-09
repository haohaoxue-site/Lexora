import { Buffer } from 'node:buffer'
import { Writable } from 'node:stream'
import { MAX_DIAGNOSTIC_RECORD_BYTES } from './diagnosticRecord'

export function createDiagnosticOutput(onLine: (line: string) => void, onDrop: () => void): Writable {
  let pending: Buffer[] = []
  let bytes = 0
  let discarding = false

  function append(chunk: Buffer) {
    if (discarding || !chunk.length)
      return
    bytes += chunk.length
    if (bytes > MAX_DIAGNOSTIC_RECORD_BYTES) {
      pending = []
      bytes = 0
      discarding = true
      onDrop()
      return
    }
    pending.push(Buffer.from(chunk))
  }

  function finishLine() {
    if (!discarding && bytes)
      onLine(Buffer.concat(pending, bytes).toString('utf8').replace(/\r$/, ''))
    pending = []
    bytes = 0
    discarding = false
  }

  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      let start = 0
      for (let end = chunk.indexOf(10); end !== -1; end = chunk.indexOf(10, start)) {
        append(chunk.subarray(start, end))
        finishLine()
        start = end + 1
      }
      append(chunk.subarray(start))
      callback()
    },
    final(callback) {
      finishLine()
      callback()
    },
    destroy(error, callback) {
      if (bytes || discarding)
        finishLine()
      callback(error)
    },
  })
  output.on('error', onDrop)
  return output
}

export interface CapturedDiagnosticOutput {
  done: Promise<void>
  stop: () => void
}

export function captureDiagnosticOutput(
  source: NodeJS.ReadableStream,
  output: Writable,
  onError: (error: Error) => void,
): CapturedDiagnosticOutput {
  let stop!: () => void
  const done = new Promise<void>((resolve) => {
    const handleError = (error: Error) => {
      onError(error)
      stop()
    }
    stop = () => {
      source.unpipe(output)
      source.removeListener('end', stop)
      source.removeListener('close', stop)
      source.removeListener('error', handleError)
      output.end()
      resolve()
    }
    source.once('end', stop)
    source.once('close', stop)
    source.once('error', handleError)
    source.pipe(output)
    if (!source.readable)
      stop()
  })
  return { done, stop }
}
