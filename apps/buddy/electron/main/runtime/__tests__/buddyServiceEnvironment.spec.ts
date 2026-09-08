import { describe, expect, it } from 'vitest'
import {
  createBuddyServiceEnvironment,
  resolveBuddySearchToolsDirectory,
} from '../buddyServiceEnvironment'

describe('buddyServiceEnvironment', () => {
  it.each([
    ['linux', '/repo/apps/buddy', '/opt/buddy/resources', '/opt/buddy/resources/search-tools', '/repo/apps/buddy/.output/build/search-tools/linux-x64'],
    ['win32', 'C:\\源码 空格\\buddy', 'C:\\Apps\\Buddy\\resources', 'C:\\Apps\\Buddy\\resources\\search-tools', 'C:\\源码 空格\\buddy\\.output\\build\\search-tools\\win32-x64'],
  ] as const)('resolves bundled and development binaries for %s without using user data', (platform, appPath, resourcesPath, packaged, development) => {
    const options = { platform, appPath, resourcesPath, architecture: 'x64' }
    expect(resolveBuddySearchToolsDirectory({ ...options, isPackaged: true })).toBe(packaged)
    expect(resolveBuddySearchToolsDirectory({ ...options, isPackaged: false })).toBe(development)
    expect(() => resolveBuddySearchToolsDirectory({ ...options, architecture: 'arm64', isPackaged: true }))
      .toThrow('Unsupported search tools target')
  })

  it('normalizes Windows environment names without leaking credentials', () => {
    const environment = createBuddyServiceEnvironment({
      Path: 'C:\\Windows\\System32',
      SYSTEMROOT: 'C:\\Windows',
      comspec: 'C:\\Windows\\System32\\cmd.exe',
      LOCALAPPDATA: 'C:\\Users\\Fixture\\AppData\\Local',
      TEMP: 'C:\\Temp',
      openai_api_key: 'fixture-secret',
      Unrelated_Secret: 'fixture-secret',
      pi_tools_dir: 'C:\\untrusted-tools',
      No_Proxy: 'localhost',
    }, 'C:\\Users\\Fixture\\.lexora\\buddy', 'win32')
    expect(environment).toEqual({
      PATH: 'C:\\Windows\\System32',
      SYSTEMROOT: 'C:\\Windows',
      COMSPEC: 'C:\\Windows\\System32\\cmd.exe',
      LOCALAPPDATA: 'C:\\Users\\Fixture\\AppData\\Local',
      TEMP: 'C:\\Temp',
      NO_PROXY: 'localhost',
      LEXORA_BUDDY_HOME: 'C:\\Users\\Fixture\\.lexora\\buddy',
      NODE_USE_ENV_PROXY: '1',
      PI_CODING_AGENT_DIR: 'C:\\Users\\Fixture\\.lexora\\buddy\\agent',
    })
  })
  it('allows only service runtime inputs and excludes ambient credentials', () => {
    const environment = createBuddyServiceEnvironment({
      HOME: '/home/example',
      OPENAI_API_KEY: 'sk-host-secret',
      PATH: '/usr/bin',
      UNRELATED_SECRET: 'host-secret',
    }, '/data/lexora/buddy')

    expect(environment).toEqual({
      LEXORA_BUDDY_HOME: '/data/lexora/buddy',
      NODE_USE_ENV_PROXY: '1',
      PI_CODING_AGENT_DIR: '/data/lexora/buddy/agent',
      PATH: '/usr/bin',
    })
  })
})
