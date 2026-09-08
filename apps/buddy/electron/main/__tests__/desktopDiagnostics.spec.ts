import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createTemporaryDirectory } from '@buddy-tests/temporaryDirectories'
import { describe, expect, it } from 'vitest'
import { DesktopDiagnosticLogger, redactDiagnosticText } from '../desktopDiagnostics'

describe('desktop diagnostics', () => {
  it('redacts home paths and credential-like values', () => {
    expect(redactDiagnosticText(
      'failed /home/alice/workspace token=sk-secret Authorization: Bearer bearer-secret',
      '/home/alice',
    )).toBe('failed <home>/workspace token=<redacted> Authorization: Bearer <redacted>')
  })

  it('writes private scope-specific local logs', async () => {
    const directory = await createTemporaryDirectory('lexora-diagnostics-')
    const logger = new DesktopDiagnosticLogger({ directory, userHome: '/home/alice' })

    await logger.write('desktop', 'opened /home/alice/workspace')
    await logger.close()

    expect(await readFile(join(directory, 'desktop.log'), 'utf8'))
      .toMatch(/\[.+\] opened <home>\/workspace\n$/)
  })
})
