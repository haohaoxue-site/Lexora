export function serializeModelMetadata(value: unknown): string {
  return JSON.stringify(sortMetadata(value))
}

function sortMetadata(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(sortMetadata)
  if (!value || typeof value !== 'object')
    return value
  return Object.fromEntries(Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, sortMetadata(entry)]))
}
