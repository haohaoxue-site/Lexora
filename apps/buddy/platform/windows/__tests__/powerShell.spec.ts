import { describe, expect, it } from 'vitest'
import { createWindowsHostEnvironment, createWindowsPowerShellResolver } from '../powerShell'

const environment = {
  SystemRoot: 'C:\\Windows',
  ProgramFiles: 'C:\\Program Files',
  PATH: '.;relative;C:\\custom powershell;C:\\Windows\\System32',
  OPENAI_API_KEY: 'should-not-be-inherited',
  PSModulePath: 'C:\\untrusted-modules',
}

describe('windows PowerShell resolution', () => {
  it('pins the installed executable once and never probes a relative PATH entry', async () => {
    const inspected: string[] = []
    let probes = 0
    const resolve = createWindowsPowerShellResolver({
      environment,
      isFile: async (path) => {
        inspected.push(path)
        return path === 'C:\\custom powershell\\pwsh.exe'
      },
      probe: async () => {
        probes += 1
        return { major: 7, edition: 'Core' }
      },
    })
    expect(await Promise.all([resolve(), resolve()])).toEqual(['C:\\custom powershell\\pwsh.exe', 'C:\\custom powershell\\pwsh.exe'])
    expect(probes).toBe(1)
    expect(inspected).toEqual(['C:\\Program Files\\PowerShell\\7\\pwsh.exe', 'C:\\custom powershell\\pwsh.exe'])
  })

  it.each([{ major: 8, edition: 'Core' }, { major: 7, edition: 'Desktop' }])('rejects an unsupported runtime: %j', async (version) => {
    const resolve = createWindowsPowerShellResolver({ environment, isFile: async () => true, probe: async () => version })
    await expect(resolve()).rejects.toMatchObject({ code: 'POWERSHELL_UNAVAILABLE' })
  })

  it('fails clearly only when neither modern nor system PowerShell is usable', async () => {
    const inspected: string[] = []
    const resolve = createWindowsPowerShellResolver({
      environment,
      isFile: async (path) => {
        inspected.push(path)
        return false
      },
      probe: async () => { throw new Error('No executable was found') },
    })
    await expect(resolve()).rejects.toMatchObject({ code: 'POWERSHELL_UNAVAILABLE' })
    expect(inspected.at(-1)).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
    expect(inspected.slice(0, -1).every(path => path.endsWith('\\pwsh.exe'))).toBe(true)
  })

  it('uses the system Windows PowerShell when PowerShell 7 is absent', async () => {
    const legacy = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    const resolve = createWindowsPowerShellResolver({
      environment,
      isFile: async path => path === legacy,
      probe: async () => ({ major: 5, minor: 1, edition: 'Desktop' }),
    })
    await expect(resolve()).resolves.toBe(legacy)
  })

  it('continues past an unusable installation to a working PowerShell 7', async () => {
    const selected = 'C:\\custom powershell\\pwsh.exe'
    const resolve = createWindowsPowerShellResolver({
      environment,
      isFile: async () => true,
      probe: async (path) => {
        if (path !== selected)
          throw new Error('The first installation cannot start')
        return { major: 7, edition: 'Core' }
      },
    })
    await expect(resolve()).resolves.toBe(selected)
  })

  it('limits fixed-host scripts to the selected runtime modules and OS environment', () => {
    const env = createWindowsHostEnvironment('C:\\Program Files\\PowerShell\\7\\pwsh.exe', environment)
    expect(env.PATH).toBe('C:\\Program Files\\PowerShell\\7;C:\\Windows\\System32')
    expect(env.PSModulePath).toBe('C:\\Program Files\\PowerShell\\7\\Modules')
    expect(env.OPENAI_API_KEY).toBeUndefined()
  })
})
