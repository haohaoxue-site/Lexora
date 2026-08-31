import { isAbsolute, join, normalize } from 'node:path'

export type BuddyRuntimeProfile = 'development' | 'stable' | 'test'

export interface BuddyRuntimePathOptions {
  defaultUserData: string
  desktopName: string
  isPackaged: boolean
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
  backupsDirectory: string
  buddyHome: string
  configPath: string
  crashDumps: string
  desktopName: string
  iconVariant: 'development' | 'stable'
  lexoraHome: string
  logs: string
  namespace: string
  nativePetSocket: string
  nativePetState: string
  profile: BuddyRuntimeProfile
  sessionData: string
  userData: string
  windowState: string
}

interface BuddyRuntimeIdentity {
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
  const lexoraHome = resolveLexoraHome(identity.profile, options)
  const runtimeDirectories = resolveRuntimeDirectories(identity, lexoraHome, options)
  const nativePetSocket = resolveAbsoluteOverride(
    options.nativePetSocketOverride,
    'LEXORA_BUDDY_PET_SOCKET',
  ) ?? runtimeDirectories.nativePetSocket
  const nativePetState = resolveAbsoluteOverride(
    options.nativePetStateOverride,
    'LEXORA_BUDDY_PET_STATE_PATH',
  ) ?? join(runtimeDirectories.stateRoot, 'pet-state.json')
  const userData = resolveAbsoluteOverride(
    options.userDataOverride,
    'Electron userData',
  ) ?? runtimeDirectories.userData

  return {
    ...identity,
    backupsDirectory: join(lexoraHome, 'backups', 'buddy'),
    buddyHome: join(lexoraHome, 'buddy'),
    configPath: join(lexoraHome, 'config.toml'),
    crashDumps: join(runtimeDirectories.stateRoot, 'crashes'),
    lexoraHome,
    logs: join(runtimeDirectories.stateRoot, 'logs'),
    nativePetSocket,
    nativePetState,
    sessionData: runtimeDirectories.sessionData,
    userData,
    windowState: join(runtimeDirectories.stateRoot, 'window-state.json'),
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
): string {
  const override = resolveAbsoluteOverride(options.lexoraHomeOverride, 'LEXORA_HOME')
  if (override)
    return override
  if (profile === 'test')
    throw new Error('LEXORA_HOME is required for the test profile')
  return join(options.userHome, profile === 'stable' ? '.lexora' : '.lexora-dev')
}

function resolveRuntimeDirectories(
  identity: BuddyRuntimeIdentity,
  lexoraHome: string,
  options: BuddyRuntimePathOptions,
): {
  nativePetSocket: string
  sessionData: string
  stateRoot: string
  userData: string
} {
  if (identity.profile === 'test') {
    const runtimeRoot = join(lexoraHome, '.runtime')
    return {
      nativePetSocket: join(runtimeRoot, 'native-pet.sock'),
      sessionData: join(runtimeRoot, 'cache', 'chromium'),
      stateRoot: join(runtimeRoot, 'state'),
      userData: join(runtimeRoot, 'electron'),
    }
  }

  const cacheHome = resolveAbsoluteXdgDirectory(
    options.xdgCacheHome,
    join(options.userHome, '.cache'),
  )
  const configHome = resolveAbsoluteXdgDirectory(
    options.xdgConfigHome,
    join(options.userHome, '.config'),
  )
  const stateHome = resolveAbsoluteXdgDirectory(
    options.xdgStateHome,
    join(options.userHome, '.local', 'state'),
  )
  const runtimeDirectory = resolveAbsoluteXdgDirectory(
    options.xdgRuntimeDirectory,
    join(options.temporaryDirectory, `${identity.namespace}-uid-${options.userId}`),
  )
  return {
    nativePetSocket: options.xdgRuntimeDirectory && isAbsolute(options.xdgRuntimeDirectory)
      ? join(runtimeDirectory, identity.namespace, 'native-pet.sock')
      : join(runtimeDirectory, 'native-pet.sock'),
    sessionData: join(cacheHome, identity.namespace, 'chromium'),
    stateRoot: join(stateHome, identity.namespace),
    userData: identity.profile === 'stable'
      ? requireAbsolutePath(options.defaultUserData, 'Electron userData')
      : join(configHome, identity.namespace, 'electron'),
  }
}

function resolveAbsoluteOverride(value: string | undefined, name: string): string | undefined {
  if (value === undefined || value === '')
    return undefined
  return requireAbsolutePath(value, name)
}

function resolveAbsoluteXdgDirectory(value: string | undefined, fallback: string): string {
  return value && isAbsolute(value) ? normalize(value) : fallback
}

function requireAbsolutePath(value: string, name: string): string {
  if (!isAbsolute(value))
    throw new Error(`${name} must be an absolute path`)
  return normalize(value)
}
