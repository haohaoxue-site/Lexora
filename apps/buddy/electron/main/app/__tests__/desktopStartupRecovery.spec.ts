import type { MessageBoxOptions } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PrivateDirectoryError } from '../../../../platform/windows/privateDirectories'
import { DesktopDiagnosticLogger } from '../../desktopDiagnostics'
import { resolveBuddyRuntimePaths } from '../../paths'
import { showDesktopStartupFailure } from '../desktopDialogs'
import { resolveStartupFailureDirectory } from '../desktopStartupFailure'

const native = vi.hoisted(() => ({
  responses: [] as number[],
  effects: [] as string[],
  messages: [] as MessageBoxOptions[],
  openError: '',
}))

vi.mock('electron', () => ({
  app: { isReady: () => true, relaunch: () => native.effects.push('restart') },
  dialog: {
    async showMessageBox(options: MessageBoxOptions) {
      native.messages.push(options)
      const response = native.responses.shift()
      if (response === undefined)
        throw new Error('Unexpected recovery dialog')
      return { response }
    },
  },
  ipcMain: {},
  Notification: {},
  shell: {
    async openPath(path: string) {
      native.effects.push(`logs:${path}`)
      return native.openError
    },
    showItemInFolder(path: string) { native.effects.push(`location:${path}`) },
  },
}))

const paths = resolveBuddyRuntimePaths({
  desktopName: 'fixture',
  defaultUserData: '/fixture/electron',
  isPackaged: true,
  userHome: '/fixture',
  userId: 1000,
  temporaryDirectory: '/tmp',
  platform: 'linux',
})
const environment = {
  paths,
  diagnostics: new DesktopDiagnosticLogger({ directory: paths.logs, appVersion: '0.6.0', userHome: '/fixture' }),
}
const failure = new PrivateDirectoryError('PRIVATE_DIRECTORIES_UNSAFE', { kind: 'private_directories', operation: 'validate_acl', directoryRole: 'user_data' })

beforeEach(() => {
  native.responses = []
  native.effects = []
  native.messages = []
  native.openError = ''
})

describe('startup recovery', () => {
  it('keeps recovery available after viewing logs and the affected location until retry is chosen', async () => {
    native.responses = [1, 2, 0]
    await showDesktopStartupFailure(failure, 'zh-CN', environment)
    expect(native.effects).toEqual([`logs:${paths.logs}`, `location:${paths.userData}`, 'restart'])
    expect(native.messages).toHaveLength(3)
    expect(native.messages[0]).toMatchObject({
      buttons: ['重新启动', '打开日志目录', '打开问题目录所在位置', '退出'],
      cancelId: 3,
    })
    expect(native.messages[0]?.detail).toContain(`问题目录: ${paths.userData}`)
  })

  it('does not close recovery when opening logs fails and never relaunches on cancel', async () => {
    native.responses = [1, 0, 3]
    native.openError = 'fixture-sensitive-path'
    await showDesktopStartupFailure(failure, 'en-US', environment)
    expect(native.effects).toEqual([`logs:${paths.logs}`])
    expect(native.messages).toHaveLength(3)
    expect(native.messages[1]?.type).toBe('warning')
    expect(JSON.stringify(native.messages)).not.toContain('fixture-sensitive-path')
  })

  it('does not derive a location from arbitrary error fields or a missing directory role', () => {
    expect(resolveStartupFailureDirectory({ directoryRole: 'user_data', path: '/untrusted' }, paths)).toBeUndefined()
    expect(resolveStartupFailureDirectory(new PrivateDirectoryError('PRIVATE_DIRECTORIES_UNSAFE', { kind: 'private_directories', operation: 'validate_acl' }), paths)).toBeUndefined()
  })
})
