import type { BuddyServiceMessageProcess } from './BuddyServicePeer'
import nodeProcess from 'node:process'
import { fileURLToPath } from 'node:url'
import { utilityProcess } from 'electron'

import { BuddyServicePeer } from './BuddyServicePeer'

export interface BuddyServiceProcessInstance extends BuddyServiceMessageProcess {
  readonly pid?: number
  readonly stderr?: NodeJS.ReadableStream | null
  readonly stdout?: NodeJS.ReadableStream | null
  kill: () => boolean
  once: (
    ((event: 'exit', listener: (code: number) => void) => unknown)
    & ((event: 'error', listener: (type: string, location: string, report: string) => void) => unknown)
  )
}

export interface BuddyServiceForkOptions {
  env?: NodeJS.ProcessEnv
  serviceName: string
  stdio: 'pipe'
}

export type ForkBuddyServiceProcess = (
  modulePath: string,
  args: string[],
  options: BuddyServiceForkOptions,
) => BuddyServiceProcessInstance

export interface ForkBuddyServiceProcessOptions {
  diagnosticOutput?: NodeJS.WritableStream
  env?: NodeJS.ProcessEnv
  forkProcess?: ForkBuddyServiceProcess
  mainModuleUrl?: string
  onFatalError?: (error: Error) => void
}

export interface BuddyServiceProcessHandle {
  peer: BuddyServicePeer
  process: BuddyServiceProcessInstance
}

export function resolveBuddyServiceEntry(mainModuleUrl = import.meta.url): string {
  return fileURLToPath(new URL('./buddy-service.js', mainModuleUrl))
}

export function forkBuddyServiceProcess(
  options: ForkBuddyServiceProcessOptions = {},
): BuddyServiceProcessHandle {
  const forkProcess = options.forkProcess
    ?? (utilityProcess.fork.bind(utilityProcess) as ForkBuddyServiceProcess)
  const process = forkProcess(
    resolveBuddyServiceEntry(options.mainModuleUrl),
    [],
    {
      env: options.env,
      serviceName: 'Buddy Local Service',
      stdio: 'pipe',
    },
  )
  process.stderr?.on('data', chunk => (
    (options.diagnosticOutput ?? nodeProcess.stderr).write(`[Buddy Local Service] ${chunk}`)
  ))
  const peer = new BuddyServicePeer({
    onFatalError: options.onFatalError,
    process,
  })
  process.once('exit', (code) => {
    peer.close(new Error(`Buddy Local Service exited with code ${code}`))
  })
  process.once('error', (type, location) => {
    const error = new Error(`Buddy Local Service failed: ${type} at ${location}`)
    peer.close(error)
    options.onFatalError?.(error)
  })
  return { peer, process }
}
