import type { FileIconName } from './iconUrls'
import associations from './materialFileAssociations.json'

const extensions = associations.extensions as Readonly<Record<string, FileIconName>>
const names = associations.names as Readonly<Record<string, FileIconName>>

export function resolveFileIcon(path: string): FileIconName {
  const fileName = path.split(/[\\/]/).at(-1)?.toLowerCase() ?? ''
  if (fileName === '.env' || fileName.startsWith('.env.'))
    return 'tune'
  if (names[fileName])
    return names[fileName]
  const segments = fileName.split('.')
  for (let index = 1; index < segments.length; index++) {
    const icon = extensions[segments.slice(index).join('.')]
    if (icon)
      return icon
  }
  return 'file'
}
