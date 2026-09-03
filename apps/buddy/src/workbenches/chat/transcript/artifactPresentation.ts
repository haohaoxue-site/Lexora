import type { LocalArtifact } from '@buddy-electron/shared/localChatApi'

export function resolveArtifactFileType(artifact: LocalArtifact): string {
  const extension = artifact.name.split('.').at(-1)
  if (extension && extension !== artifact.name && /^[a-z0-9]{1,8}$/i.test(extension))
    return extension.toUpperCase()
  const subtype = artifact.mimeType.split('/').at(-1)?.split(/[.+-]/)[0]
  return subtype?.slice(0, 8).toUpperCase() || 'FILE'
}

export function formatArtifactFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024)
    return `${sizeBytes} B`
  const units = ['KB', 'MB', 'GB'] as const
  let value = sizeBytes / 1024
  let unit: typeof units[number] = units[0]
  for (const candidate of units.slice(1)) {
    if (value < 1024)
      break
    value /= 1024
    unit = candidate
  }
  return `${Number(value.toFixed(value >= 10 ? 1 : 2))} ${unit}`
}
