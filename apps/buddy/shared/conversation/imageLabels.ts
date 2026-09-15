export function getChatImageLabels(resources: readonly { resourceId: string, kind: string, nameSource?: 'file' | 'clipboard' }[]): Map<string, string> {
  const labels = new Map<string, string>()
  for (const resource of resources) {
    if (resource.kind === 'image' && resource.nameSource === 'clipboard' && !labels.has(resource.resourceId))
      labels.set(resource.resourceId, `[Image #${labels.size + 1}]`)
  }
  return labels
}
