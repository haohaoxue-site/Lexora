import { rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

import { writeOutput } from '../../shared/cli-output.mjs'
import { resolveBuddyOutputPaths } from './output-paths.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')

export function cleanBuddyOutput(cwd = repoRoot) {
  const paths = resolveBuddyOutputPaths(cwd)
  const generatedRoots = [
    paths.outputRoot,
    join(paths.buddyRoot, 'node_modules/.tmp'),
    join(paths.buddyRoot, 'node_modules/.vite'),
    join(paths.buddyRoot, 'node_modules/.vite-temp'),
  ]

  for (const path of generatedRoots)
    rmSync(path, { force: true, recursive: true })

  return generatedRoots
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  cleanBuddyOutput()
  writeOutput('Buddy generated output cleaned')
}
