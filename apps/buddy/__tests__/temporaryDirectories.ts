import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { onTestFinished } from 'vitest'

export async function createTemporaryDirectory(
  prefix: string,
  options: { realpath?: boolean } = {},
): Promise<string> {
  let directory: string | undefined
  onTestFinished(async () => {
    if (directory)
      await rm(directory, { force: true, recursive: true })
  })
  directory = await mkdtemp(join(tmpdir(), prefix))
  return options.realpath ? realpath(directory) : directory
}
