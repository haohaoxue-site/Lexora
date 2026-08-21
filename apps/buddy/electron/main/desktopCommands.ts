import type { BrowserWindow, Event, Input } from 'electron'
import type { DesktopCommandId } from '../shared/desktopCommands'
import { mkdir } from 'node:fs/promises'
import process from 'node:process'
import {
  DESKTOP_COMMAND_REGISTRY,
  getDesktopCommand,
  matchesDesktopShortcut,
  resolveDesktopPlatform,
  resolveDesktopShortcut,
} from '../shared/desktopCommands'

export interface DesktopCommandExecutorOptions {
  getWindow: () => BrowserWindow | null
  logDirectory: string
  openExternal: (url: string) => Promise<unknown>
  openPath: (path: string) => Promise<string>
  requestQuit: () => void
}

export type ExecuteDesktopCommand = (commandId: DesktopCommandId) => Promise<void>

const DOCUMENTATION_URL = 'https://github.com/haohaoxue-site/Lexora'

export function createDesktopCommandExecutor(
  options: DesktopCommandExecutorOptions,
): ExecuteDesktopCommand {
  const handlers = {
    'app.quit': async () => options.requestQuit(),
    'help.openDocumentation': async () => {
      await options.openExternal(DOCUMENTATION_URL)
    },
    'help.openLogsDirectory': async () => {
      await mkdir(options.logDirectory, { mode: 0o700, recursive: true })
      const errorMessage = await options.openPath(options.logDirectory)
      if (errorMessage)
        throw new Error(errorMessage)
    },
    'window.close': async () => {
      options.getWindow()?.close()
    },
  } satisfies Partial<Record<DesktopCommandId, () => Promise<void>>>

  return async (commandId) => {
    const command = getDesktopCommand(commandId)
    if (command.execution !== 'main')
      throw new Error(`Desktop command must execute in renderer: ${commandId}`)
    const handler = handlers[commandId as keyof typeof handlers]
    if (!handler)
      throw new Error(`Desktop command has no main handler: ${commandId}`)
    await handler()
  }
}

export function registerDesktopCommandShortcuts(
  window: BrowserWindow,
  executeCommand: ExecuteDesktopCommand,
): void {
  const platform = resolveDesktopPlatform(process.platform)
  const shortcutCommands = DESKTOP_COMMAND_REGISTRY.filter(command => (
    command.execution === 'main' && resolveDesktopShortcut(command.id, platform) !== null
  ))

  window.webContents.on('before-input-event', (event: Event, input: Input) => {
    if (input.type !== 'keyDown')
      return

    const command = shortcutCommands.find((candidate) => {
      const shortcut = resolveDesktopShortcut(candidate.id, platform)
      return shortcut !== null && matchesDesktopShortcut(input, shortcut)
    })
    if (!command)
      return

    event.preventDefault()
    void executeCommand(command.id).catch((error) => {
      const diagnostic = error instanceof Error ? error.name : 'unknown error'
      process.stderr.write(`[Lexora Desktop] Command ${command.id} failed: ${diagnostic}\n`)
    })
  })
}
