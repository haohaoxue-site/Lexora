import type { MenuItemConstructorOptions } from 'electron'

export interface DesktopContextMenuInput {
  isEditable: boolean
  selectionText: string
}

export function createDesktopContextMenuTemplate(
  input: DesktopContextMenuInput,
): MenuItemConstructorOptions[] {
  if (input.isEditable) {
    return [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { type: 'separator' },
      { role: 'selectAll' },
    ]
  }
  return input.selectionText ? [{ role: 'copy' }] : []
}
