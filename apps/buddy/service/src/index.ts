import type { BuddyServiceFailureCode } from '../../shared/runtimeProtocol'
import { join } from 'node:path'
import process from 'node:process'
import { toPublicRunEvent } from '../../shared/publicRunEvent'
import { buddyServiceFailureCodeSchema } from '../../shared/runtimeProtocol'
import { startBuddyService } from './BuddyService'
import { RunEventLog, RunEventLogFatalError } from './events/RunEventLog'
import {
  createBuddyService,
  notifyBuddyServiceFailure,
  notifyBuddyServiceReady,
} from './rpc/BuddyServiceRpcServer'
import { openBuddyDatabase, resolveBuddyHome } from './storage/database'

const parentPort = process.parentPort

if (!parentPort) {
  process.stderr.write('Buddy Local Service requires an Electron utility process parent\n')
  process.exitCode = 1
}
else {
  void runBuddyService().catch((error: unknown) => {
    const failureCode = readBuddyServiceFailureCode(error)
    process.stderr.write(
      `Buddy Local Service failed to start: ${failureCode} (${readErrorName(error)})\n`,
    )
    process.exit(1)
  })
}

async function runBuddyService(): Promise<void> {
  if (!parentPort)
    return

  const buddyHome = process.env.LEXORA_BUDDY_HOME ?? resolveBuddyHome()
  const builtinSkillsDirectory = process.env.LEXORA_BUDDY_SKILLS_DIR
    ?? join(process.cwd(), 'service', 'resources', 'skills')
  let database: ReturnType<typeof openBuddyDatabase> | null = null
  let serviceServer: ReturnType<typeof createBuddyService> | null = null
  let serviceFailureNotified = false
  let isDatabaseClosed = false
  const closeDatabase = () => {
    if (isDatabaseClosed || !database)
      return
    isDatabaseClosed = true
    database.close()
  }
  let serviceHandle: Awaited<ReturnType<typeof startBuddyService>> | null = null
  let eventLog: RunEventLog | null = null
  let isShuttingDown = false
  const notifyFailure = (code: BuddyServiceFailureCode) => {
    if (!serviceServer || serviceFailureNotified)
      return
    serviceFailureNotified = true
    try {
      notifyBuddyServiceFailure(serviceServer, code)
    }
    catch {}
  }
  const shutdown = async (exitCode: number) => {
    if (isShuttingDown)
      return
    isShuttingDown = true
    await serviceHandle?.dispose().catch(() => {})
    await eventLog?.close().catch(() => {})
    serviceServer?.close(new Error('Buddy Local Service is shutting down'))
    closeDatabase()
    process.exit(exitCode)
  }
  serviceServer = createBuddyService({
    announceReady: false,
    port: parentPort,
    scheduleShutdown() {
      void shutdown(0)
    },
    onFatalError(error) {
      process.stderr.write(`Buddy Local Service protocol failure: ${error.name}\n`)
      void shutdown(1)
    },
  })
  process.once('exit', closeDatabase)
  try {
    const openedDatabase = openBuddyDatabase({ buddyHome })
    database = openedDatabase
    eventLog = new RunEventLog({
      database: openedDatabase,
      eventsDirectory: join(buddyHome, 'events'),
      onEvent: event => serviceServer?.notify('run.event', toPublicRunEvent(event)),
      onEventDeliveryError: (error, event) => {
        process.stderr.write(
          `Lexora Buddy run event notification failed: ${error.name} ${event.runId}#${event.sequence}\n`,
        )
      },
      onFatalFailure: (error) => {
        notifyFailure(readBuddyServiceFailureCode(error))
        const operation = 'operation' in error ? ` ${error.operation}` : ''
        const stage = 'stage' in error ? ` ${error.stage}` : ''
        const range = error.firstSequence === null || error.lastSequence === null
          ? error.runId
          : `${error.runId}#${error.firstSequence}-${error.lastSequence}`
        process.stderr.write(
          `Lexora Buddy event log fatal failure: ${error.code} ${error.commitState}${operation}${stage} ${range}\n`,
        )
        void shutdown(1)
      },
    })
    await eventLog.replayAll()
    serviceHandle = await startBuddyService({
      buddyHome,
      builtinSkillsDirectory,
      database: openedDatabase,
      eventLog,
      rpc: serviceServer,
    })
    notifyBuddyServiceReady(serviceServer)
  }
  catch (error) {
    notifyFailure(readBuddyServiceFailureCode(error))
    await serviceHandle?.dispose().catch(() => {})
    await eventLog?.close().catch(() => {})
    serviceServer.close(new Error('Buddy Local Service startup failed'))
    closeDatabase()
    throw error
  }
}

function readBuddyServiceFailureCode(error: unknown): BuddyServiceFailureCode {
  if (error instanceof RunEventLogFatalError) {
    const parsed = buddyServiceFailureCodeSchema.safeParse(error.code)
    if (parsed.success)
      return parsed.data
  }
  return 'RUNTIME_START_FAILED'
}

function readErrorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : 'unknown error'
}
