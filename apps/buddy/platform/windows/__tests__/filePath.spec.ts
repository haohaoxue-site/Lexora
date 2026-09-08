import { describe, expect, it } from 'vitest'
import { validateWindowsFilePath } from '../filePath'

describe('windows file namespace', () => {
  it.each([
    ['C:/workspace/文档.md', 'C:\\workspace\\文档.md'],
    ['\\\\server\\share\\file.txt', '\\\\server\\share\\file.txt'],
  ])('accepts ordinary fully qualified file paths: %s', (input, expected) => {
    expect(validateWindowsFilePath(input)).toBe(expected)
  })

  it.each([
    'C:relative.txt',
    '\\relative.txt',
    'file.txt',
    'C:\\workspace\\COM1',
    'C:\\workspace\\name.',
    'C:\\workspace\\name ',
    '\\\\?\\C:\\workspace\\file',
    '\\\\.\\pipe\\buddy',
    'C:\\workspace\\file\0.txt',
    'C:\\workspace\\NUL\\..\\file.txt',
    'C:\\workspace\\file.txt:stream\\..\\file.txt',
    'C:\\workspace\\COM¹.txt',
    '\\\\server\\share:stream\\file.txt',
  ])('rejects ambiguous, device and alternate-stream paths: %s', (input) => {
    expect(() => validateWindowsFilePath(input)).toThrow()
  })
})
