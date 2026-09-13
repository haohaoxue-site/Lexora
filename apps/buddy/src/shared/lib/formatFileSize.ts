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
