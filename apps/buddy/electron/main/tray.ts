import type { LexoraConfig } from '../shared/desktopApi'
import type { BuddyServiceSupervisor, BuddyServiceSupervisorState } from './runtime/BuddyServiceSupervisor'
import { Menu, nativeImage, Tray } from 'electron'
import { resolveDesktopIconPath } from './desktopIcon'
import { translateDesktopNative, translateDesktopRuntimeStatus } from './desktopNativeI18n'

export interface CreateDesktopTrayOptions {
  appPath: string
  isPackaged: boolean
  language: LexoraConfig['desktop']['language']
  onOpenDesktop: () => void
  onQuit: () => void
  resourcesPath: string
  runtime: BuddyServiceSupervisor
}

export interface DesktopTrayController {
  destroy: () => void
  setRuntimeState: (state: BuddyServiceSupervisorState) => void
  setLanguage: (language: LexoraConfig['desktop']['language']) => void
}

export function createDesktopTray(options: CreateDesktopTrayOptions): DesktopTrayController {
  const tray = new Tray(nativeImage.createFromPath(resolveDesktopIconPath(options)))
  let runtimeState = options.runtime.state
  let language = options.language

  const rebuildMenu = () => {
    const runtimeLabel = translateDesktopRuntimeStatus(language, runtimeState.status)

    tray.setContextMenu(Menu.buildFromTemplate([
      {
        label: translateDesktopNative(language, 'open'),
        click: options.onOpenDesktop,
      },
      { type: 'separator' },
      {
        label: runtimeLabel,
        enabled: false,
      },
      {
        label: translateDesktopNative(language, 'restartRuntime'),
        enabled: runtimeState.status !== 'starting'
          && runtimeState.status !== 'stopping'
          && !(runtimeState.status === 'offline' && runtimeState.pid !== null),
        click: () => void options.runtime.restart().catch(() => {}),
      },
      { type: 'separator' },
      {
        label: translateDesktopNative(language, 'quit'),
        click: options.onQuit,
      },
    ]))
  }

  tray.setToolTip('Lexora Buddy')
  tray.on('click', options.onOpenDesktop)
  rebuildMenu()

  return {
    destroy() {
      tray.destroy()
    },
    setRuntimeState(state) {
      runtimeState = state
      rebuildMenu()
    },
    setLanguage(nextLanguage) {
      language = nextLanguage
      rebuildMenu()
    },
  }
}
