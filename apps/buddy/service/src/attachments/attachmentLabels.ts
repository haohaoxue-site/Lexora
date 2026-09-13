export function getAttachmentLabels(
  records: readonly { id: string, mimeType?: string, nameSource?: 'file' | 'clipboard' }[],
  prompt: string,
): Record<string, string> {
  let imageOrdinal = 0
  let fileOrdinal = 0
  const legacyImageLabels = /\[IMAGE#\d+\]/.test(prompt)
  return Object.fromEntries(records.map((record) => {
    const image = record.mimeType?.startsWith('image/') && record.mimeType !== 'image/svg+xml'
    const label = image && (legacyImageLabels || record.nameSource === 'clipboard')
      ? legacyImageLabels ? `[IMAGE#${++imageOrdinal}]` : `[Image #${++imageOrdinal}]`
      : `[FILE#${++fileOrdinal}]`
    return [record.id, label]
  }))
}
