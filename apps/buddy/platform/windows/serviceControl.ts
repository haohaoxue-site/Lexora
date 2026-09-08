import type { NativeCommandResult } from '../nativeCommand'
import process from 'node:process'
import { runNativeCommand } from '../nativeCommand'
import { validateWindowsFilePath } from './filePath'

interface ServiceControlRequest {
  operation: 'resolve' | 'read' | 'execute'
  serviceId: string
  action?: 'start-service' | 'stop-service' | 'restart-service'
}

export async function runWindowsServiceControl(input: ServiceControlRequest, signal: AbortSignal): Promise<NativeCommandResult> {
  signal.throwIfAborted()
  const executable = process.env.LEXORA_BUDDY_SERVICE_CONTROL
  if (!executable)
    throw new Error('Windows service control helper is unavailable')
  return runNativeCommand(validateWindowsFilePath(executable), [], input, {
    env: { SystemRoot: process.env.SystemRoot },
    maxBytes: 16 * 1024,
    signal,
  })
}
