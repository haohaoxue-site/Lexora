import type { FastifyInstance } from 'fastify'
import process from 'node:process'

const DEFAULT_COLLAB_SHUTDOWN_TIMEOUT_MS = 5_000

interface CollabShutdownApp {
  close: () => Promise<unknown>
  log: Pick<FastifyInstance['log'], 'error' | 'info'>
}

export interface CreateCollabShutdownHandlerInput {
  app: CollabShutdownApp
  exit?: (code: number) => void
  timeoutMs?: number
}

export function createCollabShutdownHandler(input: CreateCollabShutdownHandlerInput) {
  const exit = input.exit ?? ((code: number) => process.exit(code))
  const timeoutMs = input.timeoutMs ?? DEFAULT_COLLAB_SHUTDOWN_TIMEOUT_MS
  let shuttingDown = false

  return async function shutdown(signal: NodeJS.Signals): Promise<void> {
    if (shuttingDown) {
      return
    }

    shuttingDown = true
    input.app.log.info({ signal }, 'Collab is shutting down')

    const timeout = setTimeout(() => {
      input.app.log.error({ signal, timeoutMs }, 'Collab shutdown timed out')
      exit(1)
    }, timeoutMs)

    try {
      await input.app.close()
      clearTimeout(timeout)
      exit(0)
    }
    catch (error) {
      clearTimeout(timeout)
      input.app.log.error({ error: toErrorLogContext(error) }, 'Collab shutdown failed')
      exit(1)
    }
  }
}

export function registerCollabProcessShutdown(app: CollabShutdownApp): void {
  const shutdown = createCollabShutdownHandler({ app })

  process.once('SIGTERM', signal => void shutdown(signal))
  process.once('SIGINT', signal => void shutdown(signal))
}

function toErrorLogContext(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    }
  }

  return error
}
