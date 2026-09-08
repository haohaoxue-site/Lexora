import type { BrowserWindow } from 'electron'
import type { Writable } from 'node:stream'
import type { LexoraConfig } from '../../shared/desktopApi'
import type { DesktopDiagnosticLogger } from '../desktopDiagnostics'
import type { BuddyRuntimePaths } from '../paths'
import type { DesktopLaunchIntent } from '../startupIntent'

export interface DesktopEnvironment {
  diagnostics: DesktopDiagnosticLogger
  desktopIconPath: string
  initialLaunchIntent: DesktopLaunchIntent
  isSmokeTest: boolean
  paths: BuddyRuntimePaths
  serviceDiagnosticOutput: Writable
  setAutostart: (enabled: boolean) => Promise<void>
  trayIconPath: string
  writeDiagnostic: (message: string) => void
}

export interface DesktopQuitOptions {
  discardDraftsOnFailure?: boolean
}

export interface DesktopQuitHost {
  getWindow: () => BrowserWindow | null
  getLanguage: () => LexoraConfig['desktop']['language']
}
