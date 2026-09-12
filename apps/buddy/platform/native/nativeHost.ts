import { posix, win32 } from 'node:path'
import process from 'node:process'
import nativeHost from './nativeHost.json'

interface NativeHostPaths {
  appPath: string
  isPackaged: boolean
  resourcesPath: string
  platform?: NodeJS.Platform
  architecture?: string
}

export function createBuddyNativeEnvironment(options: NativeHostPaths): Record<string, string> {
  const reader = resolveBuddyFileReader(options)
  const serviceControl = resolveBuddyServiceControl(options)
  const processControl = resolveBuddyProcessControl(options)
  const runtimeGuard = resolveNativeComponent('runtimeGuard', options)
  return {
    ...(reader ? { LEXORA_BUDDY_FILE_READER: reader } : {}),
    ...(serviceControl ? { LEXORA_BUDDY_SERVICE_CONTROL: serviceControl } : {}),
    ...(processControl ? { LEXORA_BUDDY_PROCESS_CONTROL: processControl } : {}),
    ...(runtimeGuard ? { LEXORA_BUDDY_RUNTIME_GUARD: runtimeGuard } : {}),
    LEXORA_BUDDY_IMAGE_TRANSFORMER: resolveBuddyImageTransformer(options),
  }
}

export function resolveBuddyFileReader(options: NativeHostPaths): string | undefined {
  return resolveNativeComponent('fileReader', options)
}

export function resolveBuddyServiceControl(options: NativeHostPaths): string | undefined {
  return resolveNativeComponent('serviceControl', options)
}

export function resolveBuddyProcessControl(options: NativeHostPaths): string | undefined {
  return resolveNativeComponent('processControl', options)
}

export function resolveBuddyPrivateDirectories(options: NativeHostPaths): string | undefined {
  return resolveNativeComponent('privateDirectories', options)
}

export function resolveBuddyShellSandbox(options: NativeHostPaths): string | undefined {
  return resolveNativeComponent('shellSandbox', options)
}

export function resolveBuddyImageTransformer(options: NativeHostPaths): string {
  const executable = resolveNativeComponent('imageTransform', options)
  if (!executable)
    throw new Error('Unsupported Buddy image transformer platform')
  return executable
}

function resolveNativeComponent(name: keyof typeof nativeHost.components, options: NativeHostPaths): string | undefined {
  const platform = options.platform ?? process.platform
  const architecture = options.architecture ?? process.arch
  if (!['linux', 'win32'].includes(platform) || architecture !== 'x64')
    throw new Error('Unsupported Buddy native component platform')
  const component = nativeHost.components[name]
  const target = Object.entries(component.targets).find(([id]) => id === `${platform}-${architecture}`)?.[1]
  if (!target)
    return undefined
  const paths = platform === 'win32' ? win32 : posix
  return options.isPackaged
    ? paths.join(options.resourcesPath, target.resource)
    : paths.join(options.appPath, nativeHost.directory, target.triple, 'release', target.executable)
}
