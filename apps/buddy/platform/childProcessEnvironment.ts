import type { BuddyPlatform } from '../shared/platform'
import { currentPlatform } from './currentPlatform'

export function createChildProcessEnvironment(options: {
  source: NodeJS.ProcessEnv
  additions?: NodeJS.ProcessEnv
  platform?: BuddyPlatform
}): Record<string, string> {
  const policy = (options.platform ?? currentPlatform).environment
  const normalize = policy.caseSensitive ? (key: string) => key : (key: string) => key.toUpperCase()
  const inherited = new Map(Object.entries(options.source).map(([key, value]) => [normalize(key), value]))
  const environment = new Map<string, string>()
  for (const name of policy.names) {
    const key = normalize(name)
    const value = inherited.get(key)
    if (typeof value === 'string' && !value.startsWith('()'))
      environment.set(key, value)
  }
  for (const [name, value] of Object.entries(options.additions ?? {})) {
    if (typeof value === 'string')
      environment.set(normalize(name), value)
  }
  return Object.fromEntries(environment)
}
