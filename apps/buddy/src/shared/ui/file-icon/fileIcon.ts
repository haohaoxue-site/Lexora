import type { FileIconName } from './iconUrls'
import { FILE_ICON_URLS, FOLDER_ICON_URLS } from './iconUrls'
import { resolveFileIcon } from './resolveFileIcon'

export function getFileIconUrl(name: FileIconName): string {
  return FILE_ICON_URLS[name]
}

export function resolveFileIconUrl(path: string): string {
  return getFileIconUrl(resolveFileIcon(path))
}

export function getFolderIconUrl(expanded = false): string {
  return FOLDER_ICON_URLS[expanded ? 'expanded' : 'collapsed']
}
