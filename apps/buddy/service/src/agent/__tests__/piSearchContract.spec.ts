import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { createFindTool, createGrepTool } from '@earendil-works/pi-coding-agent'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveBuddySearchToolsDirectory } from '../../../../electron/main/runtime/buddyServiceEnvironment'

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'buddy-search-'))
  vi.stubEnv('PI_TOOLS_DIR', resolveBuddySearchToolsDirectory({ appPath: join(import.meta.dirname, '../../../..'), resourcesPath: '', isPackaged: false }))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function text(result: { content: Array<{ type: string, text?: string }> }) {
  return result.content.flatMap(item => item.type === 'text' ? [item.text] : []).join('\n')
}

describe('pi search execution contract', () => {
  it('takes context from the same rg stream without rereading whole files', async () => {
    await writeFile(join(root, '文档.txt'), 'before\r\nneedle\r\nafter\r\n')
    const tool = createGrepTool(root, { operations: {
      isDirectory: () => true,
      readFile: () => { throw new Error('A whole-file context read is unavailable') },
    } })
    const result = await tool.execute('search', { pattern: 'needle', context: 1 })
    expect(text(result)).toContain('文档.txt-1- before')
    expect(text(result)).toContain('文档.txt:2: needle')
    expect(text(result)).toContain('文档.txt-3- after')
  })

  it('matches the full long line before clipping its display', async () => {
    await writeFile(join(root, 'long.txt'), `${'x'.repeat(100_000)}needle\n`)
    const result = await createGrepTool(root).execute('search', { pattern: 'needle' })
    expect(text(result)).toContain('long.txt:1:')
    expect(Buffer.byteLength(text(result))).toBeLessThan(2048)
    expect(result.details).toMatchObject({ linesTruncated: true })
  })

  it('rejects oversized raw search records instead of reporting no matches', async () => {
    await writeFile(join(root, 'huge.txt'), `needle${'x'.repeat(9 * 1024 * 1024)}\n`)
    await expect(createGrepTool(root).execute('search', { pattern: 'needle' })).rejects.toThrow(/output limit/i)
  })

  it('honors parent ignores by default and explicitly scoped directory searches', async () => {
    await mkdir(join(root, '.git'))
    await writeFile(join(root, '.gitignore'), 'generated/\n')
    await mkdir(join(root, 'generated'))
    await writeFile(join(root, 'generated', 'a.txt'), 'needle\n')
    expect(text(await createGrepTool(root).execute('search', { pattern: 'needle' }))).toBe('No matches found')
    expect(text(await createGrepTool(root).execute('search', { pattern: 'needle', path: 'generated' }))).toContain('a.txt:1: needle')
  })

  it('preserves whitespace and newline filenames in fd output', async () => {
    const name = process.platform === 'win32' ? ' leading name.txt' : ' leading\ntrailing '
    await writeFile(join(root, name), 'content')
    expect(text(await createFindTool(root).execute('find', { pattern: '*' }))).toBe(name)
  })

  it('keeps invalid patterns and cancellation distinct from empty results', async () => {
    await expect(createGrepTool(root).execute('search', { pattern: '[' })).rejects.toThrow()
    await expect(createGrepTool(root).execute('search', { pattern: 'needle' }, AbortSignal.abort())).rejects.toThrow()
  })
})
