import { describe, expect, it } from 'vitest'
import { filePathAdapters } from '../filePaths'

describe('file path adapters', () => {
  it('preserves Linux filenames containing colons and backslashes', () => {
    const path = '/workspace/report:notes\\draft'
    expect(filePathAdapters.linux.resolveInput(path)).toBe(path)
  })

  it('requires explicit roots and rejects NUL in either adapter', () => {
    for (const adapter of Object.values(filePathAdapters)) {
      expect(() => adapter.resolveInput('relative.txt')).toThrow()
      expect(() => adapter.resolveInput('')).toThrow()
      expect(() => adapter.resolveInput('\0')).toThrow()
    }
  })
})
