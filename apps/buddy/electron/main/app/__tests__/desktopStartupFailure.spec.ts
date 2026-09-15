import { describe, expect, it } from 'vitest'
import { PowerShellUnavailableError } from '../../../../platform/windows/powerShell'
import { PrivateDirectoryError } from '../../../../platform/windows/privateDirectories'
import { describeDesktopStartupFailure } from '../desktopStartupFailure'

describe('startup failure presentation', () => {
  it('gives a useful private storage explanation and a diagnostic reference', () => {
    const error = new PrivateDirectoryError('PRIVATE_DIRECTORIES_UNSAFE', { kind: 'private_directories', operation: 'validate_acl' })
    const options = describeDesktopStartupFailure(error, 'zh-CN', 'launch-fixture')
    expect(options.detail).toContain('访问权限不符合要求')
    expect(options.detail).toContain('诊断编号: launch-fixture')
    expect(options.buttons).toEqual(['重新检查并启动', '打开日志目录', '退出'])
    expect(options.cancelId).toBe(2)
    expect(options.detail).toContain('数据没有被重置')
  })

  it('keeps PowerShell recovery guidance and hides arbitrary error text', () => {
    expect(describeDesktopStartupFailure(new PowerShellUnavailableError(), 'en-US').detail).toContain('Install PowerShell 7')
    const options = describeDesktopStartupFailure(new Error('token=fixture-secret C:\\Users\\fixture'), 'en-US')
    expect(options.message).toBe('Lexora Buddy could not start')
    expect(options.detail).toContain('OPERATION_FAILED')
    expect(options.detail).not.toContain('fixture')
  })
})
