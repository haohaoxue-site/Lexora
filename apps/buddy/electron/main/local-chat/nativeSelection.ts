import type { BrowserWindow, OpenDialogOptions } from 'electron'
import { dialog } from 'electron'

export async function selectPaths(
  window: BrowserWindow | null,
  options: OpenDialogOptions,
): Promise<string[]> {
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? [] : result.filePaths
}
