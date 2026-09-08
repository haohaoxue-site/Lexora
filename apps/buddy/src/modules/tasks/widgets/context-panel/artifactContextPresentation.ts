import type { LocalArtifact } from '@buddy-shared/artifacts/artifactApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'

export function resolveFileType(artifact: LocalArtifact): string {
  const extension = artifact.name.split('.').at(-1)
  if (extension && extension !== artifact.name && /^[a-z0-9]{1,8}$/i.test(extension))
    return extension.toUpperCase()
  return artifact.mimeType.split('/').at(-1)?.split(/[.+-]/)[0]?.toUpperCase() || 'FILE'
}

export function formatFileSize(sizeBytes: number): string {
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

export function formatDate(value: string, locale: BuddyLocale): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function isTextMimeType(mimeType: string): boolean {
  return mimeType.startsWith('text/') || [
    'application/json',
    'application/toml',
    'application/xml',
    'application/yaml',
  ].includes(mimeType)
}
