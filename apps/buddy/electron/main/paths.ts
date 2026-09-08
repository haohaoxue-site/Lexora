import process from 'node:process'
import { resolveBuddyPlatform, supportsBuddyFeature } from '../../shared/platform'
import { runtimePathLayouts } from './platform/runtimePathLayouts'

export type BuddyRuntimeProfile = 'development' | 'stable' | 'test'
type PlatformPath = Pick<typeof import('node:path'), 'isAbsolute' | 'normalize' | 'join'>

export interface BuddyRuntimePathOptions {
  defaultUserData: string
  desktopName: string
  isPackaged: boolean
  localAppData?: string
  platform?: NodeJS.Platform
  lexoraHomeOverride?: string
  nativePetSocketOverride?: string
  nativePetStateOverride?: string
  profileOverride?: string
  smokeTest?: boolean
  temporaryDirectory: string
  userDataOverride?: string
  userHome: string
  userId: number
  xdgCacheHome?: string
  xdgConfigHome?: string
  xdgRuntimeDirectory?: string
  xdgStateHome?: string
}

export interface BuddyRuntimePaths {
  appName: string
  browserAdapterSocket: string
  buddyHome: string
  configPath: string
  crashDumps: string
  desktopName: string
  iconVariant: 'development' | 'stable'
  lexoraHome: string
  logs: string
  namespace: string
  nativePetSocket: string | null
  nativePetState: string | null
  profile: BuddyRuntimeProfile
  sessionData: string
  userData: string
  windowState: string
}

export interface BuddyRuntimeIdentity {
  appName: string
  desktopName: string
  iconVariant: 'development' | 'stable'
  namespace: string
  profile: BuddyRuntimeProfile
}

const BUDDY_RUNTIME_PROFILES = new Set<BuddyRuntimeProfile>([
  'development',
  'stable',
  'test',
])

export function resolveBuddyRuntimePaths(
  options: BuddyRuntimePathOptions,
): BuddyRuntimePaths {
  const identity = resolveBuddyRuntimeIdentity(options)
  const platform = resolveBuddyPlatform(options.platform ?? process.platform)
  const layout = runtimePathLayouts[platform.id]
  const { path } = layout
  const joinPath = path.join
  const lexoraHome = resolveLexoraHome(identity.profile, options, path)
  const runtimeDirectories = layout.resolveDirectories(identity, lexoraHome, options)
  const nativePetSocket = supportsBuddyFeature(platform, 'nativePet')
    ? resolveAbsoluteOverride(
      options.nativePetSocketOverride,
      'LEXORA_BUDDY_PET_SOCKET',
      path,
    ) ?? runtimeDirectories.nativePetSocket
    : null
  const nativePetState = supportsBuddyFeature(platform, 'nativePet')
    ? resolveAbsoluteOverride(
      options.nativePetStateOverride,
      'LEXORA_BUDDY_PET_STATE_PATH',
      path,
    ) ?? joinPath(runtimeDirectories.stateRoot, 'pet-state.json')
    : null
  const userData = resolveAbsoluteOverride(
    options.userDataOverride,
    'Electron userData',
    path,
  ) ?? runtimeDirectories.userData

  return {
    ...identity,
    browserAdapterSocket: runtimeDirectories.browserAdapterSocket,
    buddyHome: joinPath(lexoraHome, 'buddy'),
    configPath: joinPath(lexoraHome, 'config.toml'),
    crashDumps: joinPath(runtimeDirectories.stateRoot, 'crashes'),
    lexoraHome,
    logs: joinPath(runtimeDirectories.stateRoot, 'logs'),
    nativePetSocket,
    nativePetState,
    sessionData: runtimeDirectories.sessionData,
    userData,
    windowState: joinPath(runtimeDirectories.stateRoot, 'window-state.json'),
  }
}

function resolveBuddyRuntimeIdentity(
  options: BuddyRuntimePathOptions,
): BuddyRuntimeIdentity {
  const profile = resolveBuddyRuntimeProfile(options)
  if (profile === 'stable') {
    return {
      appName: 'Lexora Buddy',
      desktopName: options.desktopName,
      iconVariant: 'stable',
      namespace: 'lexora-buddy',
      profile,
    }
  }
  if (profile === 'development') {
    return {
      appName: 'Lexora Buddy Dev',
      desktopName: `${options.desktopName}.Development`,
      iconVariant: 'development',
      namespace: 'lexora-buddy-dev',
      profile,
    }
  }
  return {
    appName: 'Lexora Buddy Test',
    desktopName: `${options.desktopName}.Test`,
    iconVariant: 'stable',
    namespace: 'lexora-buddy-test',
    profile,
  }
}

function resolveBuddyRuntimeProfile(
  options: BuddyRuntimePathOptions,
): BuddyRuntimeProfile {
  if (options.smokeTest)
    return 'test'
  if (options.profileOverride === undefined)
    return options.isPackaged ? 'stable' : 'development'
  if (!BUDDY_RUNTIME_PROFILES.has(options.profileOverride as BuddyRuntimeProfile))
    throw new Error('LEXORA_BUDDY_PROFILE must be stable, development, or test')
  return options.profileOverride as BuddyRuntimeProfile
}

function resolveLexoraHome(
  profile: BuddyRuntimeProfile,
  options: BuddyRuntimePathOptions,
  path: PlatformPath,
): string {
  const override = resolveAbsoluteOverride(options.lexoraHomeOverride, 'LEXORA_HOME', path)
  if (override)
    return override
  if (profile === 'test')
    throw new Error('LEXORA_HOME is required for the test profile')
  return path.join(options.userHome, profile === 'stable' ? '.lexora' : '.lexora-dev')
}

function resolveAbsoluteOverride(value: string | undefined, name: string, path: PlatformPath): string | undefined {
  if (value === undefined || value === '')
    return undefined
  return requireAbsolutePath(value, name, path)
}

function requireAbsolutePath(value: string, name: string, path: PlatformPath): string {
  if (!path.isAbsolute(value))
    throw new Error(`${name} must be an absolute path`)
  return path.normalize(value)
}
