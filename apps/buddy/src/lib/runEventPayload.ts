const RUN_EVENT_TEXT_PREVIEW_CHARS = 240
const RUN_EVENT_PAYLOAD_PREVIEW_CHARS = 1200

export function normalizeRunEventPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}

  return value as Record<string, unknown>
}

export function compactRunEventText(
  value: string,
  maxChars = RUN_EVENT_TEXT_PREVIEW_CHARS,
): string {
  if (value.length <= maxChars)
    return value

  return `${value.slice(0, maxChars)}... (${value.length} chars)`
}

export function stringifyRunEventPayloadPreview(payload: unknown): string {
  if (payload == null)
    return ''

  if (typeof payload === 'string')
    return compactRunEventText(payload, RUN_EVENT_PAYLOAD_PREVIEW_CHARS)

  try {
    const seen = new WeakSet<object>()
    const json = JSON.stringify(payload, (_key, value) => {
      if (typeof value === 'string')
        return compactRunEventText(value)

      if (value && typeof value === 'object') {
        if (seen.has(value))
          return '[Circular]'

        seen.add(value)
      }

      return value
    })

    return compactRunEventText(json ?? '', RUN_EVENT_PAYLOAD_PREVIEW_CHARS)
  }
  catch {
    return '[Unserializable payload]'
  }
}

export function readRunEventPayloadString(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key]
  return typeof value === 'string' ? value : null
}

export function readRunEventFilePaths(
  payload: Record<string, unknown>,
  readLegacyPaths: () => ReadonlyArray<string>,
): ReadonlyArray<string> {
  if (Array.isArray(payload.filePaths)) {
    return payload.filePaths.filter((path): path is string =>
      typeof path === 'string' && path.length > 0,
    )
  }

  return readLegacyPaths()
}

export function extractUnifiedDiffFilePaths(diff: string | null): ReadonlyArray<string> {
  if (!diff)
    return []

  const paths = new Set<string>()
  for (const line of diff.split('\n')) {
    const diffFileMatch = /^diff --git a\/.+? b\/(.+)$/.exec(line)
    if (diffFileMatch?.[1]) {
      paths.add(diffFileMatch[1])
      continue
    }

    const nextFileMatch = /^\+\+\+ b\/(.+)$/.exec(line)
    if (nextFileMatch?.[1])
      paths.add(nextFileMatch[1])
  }

  return [...paths]
}

export function extractPatchChangeFilePaths(value: unknown): ReadonlyArray<string> {
  if (!Array.isArray(value))
    return []

  return value
    .map(change => normalizeRunEventPayload(change))
    .map(change =>
      readRunEventPayloadString(change, 'path')
      ?? readRunEventPayloadString(change, 'file')
      ?? readRunEventPayloadString(change, 'target'),
    )
    .filter((path): path is string => path !== null)
}
