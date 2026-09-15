import { describe, expect, it } from 'vitest'
import { composerReferencePath } from '../composerReferencePath'

describe('composer reference display paths', () => {
  it.each([
    ['/work/apps/buddy', '/work', 'apps/buddy'],
    ['/work-other/file.txt', '/work', '/work-other/file.txt'],
    ['/downloads/doro.avif', '/work', '/downloads/doro.avif'],
    ['/', '/', '.'],
    ['/notes.txt', '/', 'notes.txt'],
    ['C:\\Work\\apps\\buddy', 'c:\\work', 'apps/buddy'],
    ['D:\\Downloads\\a.png', 'C:\\work', 'D:\\Downloads\\a.png'],
    ['C:\\', 'C:\\', '.'],
    ['\\\\server\\share\\apps\\buddy', '\\\\server\\share', 'apps/buddy'],
  ])('formats %s relative only to %s', (path, root, expected) => {
    expect(composerReferencePath(path, root)).toBe(expected)
  })
})
