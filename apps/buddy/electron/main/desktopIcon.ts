import { existsSync } from 'node:fs'
import { join } from 'node:path'

export interface DesktopIconOptions {
  appPath: string
  isPackaged: boolean
  resourcesPath: string
}

export function resolveDesktopIconPath(options: DesktopIconOptions): string {
  return resolveIconPath(options, 'app', '256x256.png')
}

function resolveIconPath(
  options: DesktopIconOptions,
  directory: string,
  name: string,
): string {
  const iconPath = options.isPackaged
    ? join(options.resourcesPath, 'icons', directory, name)
    : join(options.appPath, 'resources', 'icons', directory, name)

  if (!existsSync(iconPath))
    throw new Error(`Lexora desktop icon is missing: ${iconPath}`)

  return iconPath
}
