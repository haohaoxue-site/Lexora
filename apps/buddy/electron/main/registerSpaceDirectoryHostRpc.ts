import type { BrowserWindow, OpenDialogOptions } from 'electron'
import type { RuntimeRpcPeerContract } from '../../shared/runtimeRpcPeer'
import type { LexoraConfig } from '../shared/desktopApi'
import { dialog } from 'electron'
import {
  SPACE_ADDITIONAL_DIRECTORY_SELECTION_HOST_METHOD,
  spaceAdditionalDirectorySelectionParamsSchema,
  spaceAdditionalDirectorySelectionResultSchema,
} from '../../shared/spaceDirectoryAuthorization'
import { translateDesktopNative } from './desktopNativeI18n'

export interface RegisterSpaceDirectoryHostRpcOptions {
  getLanguage: () => LexoraConfig['desktop']['language']
  getWindow: () => BrowserWindow | null
}

export function registerSpaceDirectoryHostRpc(
  peer: RuntimeRpcPeerContract,
  options: RegisterSpaceDirectoryHostRpcOptions,
): () => void {
  return peer.onRequest(SPACE_ADDITIONAL_DIRECTORY_SELECTION_HOST_METHOD, async (params) => {
    spaceAdditionalDirectorySelectionParamsSchema.parse(params)
    const dialogOptions: OpenDialogOptions = {
      properties: ['openDirectory'],
      title: translateDesktopNative(options.getLanguage(), 'authorizeAdditionalDirectory'),
    }
    const window = options.getWindow()
    const result = window
      ? await dialog.showOpenDialog(window, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)
    return spaceAdditionalDirectorySelectionResultSchema.parse({
      root: result.canceled ? null : result.filePaths[0] ?? null,
    })
  })
}
