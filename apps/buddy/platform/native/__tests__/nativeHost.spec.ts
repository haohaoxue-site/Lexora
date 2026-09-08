import { describe, expect, it } from 'vitest'
import { createBuddyNativeEnvironment, resolveBuddyPrivateDirectories } from '../nativeHost'

describe('native reader environment', () => {
  it('does not send undefined values to Linux utilityProcess.fork', () => {
    expect(resolveBuddyPrivateDirectories({ platform: 'linux', architecture: 'x64', appPath: '/app', resourcesPath: '/resources', isPackaged: false })).toBeUndefined()
    expect(createBuddyNativeEnvironment({ platform: 'linux', architecture: 'x64', appPath: '/app', resourcesPath: '/resources', isPackaged: false })).toEqual({
      LEXORA_BUDDY_PROCESS_CONTROL: '/app/.output/build/native/x86_64-unknown-linux-gnu/release/lexora-buddy-process-control',
      LEXORA_BUDDY_FILE_READER: '/app/.output/build/native/x86_64-unknown-linux-gnu/release/lexora-buddy-file-reader',
      LEXORA_BUDDY_IMAGE_TRANSFORMER: '/app/.output/build/native/x86_64-unknown-linux-gnu/release/lexora-buddy-image-transform',
    })
  })
  it('uses a fixed packaged Windows executable rather than cwd or ambient PATH', () => {
    expect(resolveBuddyPrivateDirectories({ platform: 'win32', architecture: 'x64', appPath: 'C:\\app\\app.asar', resourcesPath: 'C:\\app\\resources', isPackaged: true })).toBe('C:\\app\\resources\\native-host\\lexora-buddy-private-directories.exe')
    expect(createBuddyNativeEnvironment({ platform: 'win32', architecture: 'x64', appPath: 'C:\\app\\app.asar', resourcesPath: 'C:\\app\\resources', isPackaged: true })).toEqual({
      LEXORA_BUDDY_FILE_READER: 'C:\\app\\resources\\native-host\\lexora-buddy-file-reader.exe',
      LEXORA_BUDDY_SERVICE_CONTROL: 'C:\\app\\resources\\native-host\\lexora-buddy-service-control.exe',
      LEXORA_BUDDY_PROCESS_CONTROL: 'C:\\app\\resources\\native-host\\lexora-buddy-process-control.exe',
      LEXORA_BUDDY_RUNTIME_GUARD: 'C:\\app\\resources\\native-host\\lexora-buddy-runtime-guard.exe',
      LEXORA_BUDDY_IMAGE_TRANSFORMER: 'C:\\app\\resources\\native-image\\lexora-buddy-image-transform.exe',
    })
  })
})
