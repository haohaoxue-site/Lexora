import searchTools from '../../../apps/buddy/platform/native/searchTools.json' with { type: 'json' }
import definitions from '../../../apps/buddy/shared/platform/definitions.json' with { type: 'json' }
import { nativeHostResources } from './native-host.mjs'

export function resolvePackagingPlatform(id) {
  if (!Object.hasOwn(definitions.platforms, id))
    throw new Error(`Unsupported Buddy platform: ${id}`)
  return { ...definitions.platforms[id], id }
}

export function resolvePackageTargetPlatform(target) {
  const matches = Object.entries(definitions.platforms).filter(([, definition]) => definition.packageTargets.includes(target))
  if (matches.length !== 1)
    throw new Error(`Unsupported Buddy package target: ${target}`)
  return resolvePackagingPlatform(matches[0][0])
}

export function platformResources(platform) {
  return [
    ...nativeHostResources(platform.id),
    { from: `${searchTools.resource.from}/${platform.id}-x64`, to: searchTools.resource.to },
    ...platform.features.flatMap(id => definitions.features[id].resources),
  ]
}

export function platformSkills(platform) {
  return platform.features.flatMap(id => definitions.features[id].skills)
}

export function excludedPlatformResources(platform) {
  return Object.entries(definitions.features)
    .filter(([id]) => !platform.features.includes(id))
    .flatMap(([, feature]) => feature.resources)
}
