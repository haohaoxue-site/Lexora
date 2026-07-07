import { invoke } from '@tauri-apps/api/core'

export interface BuddyCommandError {
  message: string
}

export function isTauriRuntime() {
  return typeof window !== 'undefined' && Reflect.has(window, '__TAURI_INTERNALS__')
}

export function normalizeBuddyCommandError(error: unknown): Error {
  if (isBuddyCommandError(error))
    return new Error(error.message)

  if (error instanceof Error)
    return error

  return new Error('Lexora 本地命令执行失败')
}

export async function invokeBuddyCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args)
  }
  catch (error) {
    throw normalizeBuddyCommandError(error)
  }
}

function isBuddyCommandError(error: unknown): error is BuddyCommandError {
  return typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof error.message === 'string'
    && error.message.length > 0
}
