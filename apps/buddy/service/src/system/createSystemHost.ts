import type { BuddyPlatformId } from '../../../shared/platform'
import type { SystemHostPort } from './systemCapability'
import { LinuxSystemHost } from './adapters/linux/LinuxSystemHost'
import { WindowsSystemHost } from './adapters/windows/WindowsSystemHost'

const factories: Record<BuddyPlatformId, () => SystemHostPort> = {
  linux: () => new LinuxSystemHost(),
  win32: () => new WindowsSystemHost(),
}

export function createSystemHost(platform: BuddyPlatformId): SystemHostPort {
  return factories[platform]()
}
