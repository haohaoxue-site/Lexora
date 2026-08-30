import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

import { writeOutput } from '../../shared/cli-output.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')
const desktopPngs = [
  ['packages/assets/brand/app-icon.png', 512],
  ['packages/assets/brand/lexora-avatar.png', 1254],
  ['apps/buddy/resources/icons/app-icon.png', 512],
  ['apps/buddy/resources/brand/lexora-avatar.png', 1254],
]
const mirroredPngs = [
  [
    'packages/assets/brand/app-icon.png',
    'apps/buddy/resources/icons/app-icon.png',
  ],
  [
    'packages/assets/brand/lexora-avatar.png',
    'apps/buddy/resources/brand/lexora-avatar.png',
  ],
]

export function verifyDesktopAssets(cwd = repoRoot) {
  const errors = []
  for (const [path, size] of desktopPngs)
    verifyPng(cwd, path, size, errors)

  for (const [source, runtime] of mirroredPngs) {
    const sourcePath = join(cwd, source)
    const runtimePath = join(cwd, runtime)
    if (
      existsSync(sourcePath)
      && existsSync(runtimePath)
      && !readFileSync(sourcePath).equals(readFileSync(runtimePath))
    ) {
      errors.push(`${runtime} must match ${source}`)
    }
  }

  for (const legacy of [
    'apps/buddy/resources/icons/app',
    'apps/buddy/resources/icons/icon.png',
    'apps/buddy/resources/icons/128x128.png',
    'apps/buddy/resources/icons/128x128@2x.png',
    'apps/buddy/resources/icons/32x32.png',
    'packages/assets/brand/buddy-avatar.png',
    'packages/assets/sources/buddy-portrait-reference.png',
  ]) {
    if (existsSync(join(cwd, legacy)))
      errors.push(`${legacy} is a legacy desktop asset`)
  }
  return errors
}

function verifyPng(cwd, relativePath, expectedSize, errors) {
  const path = join(cwd, relativePath)
  if (!existsSync(path)) {
    errors.push(`${relativePath} is missing`)
    return
  }
  const content = readFileSync(path)
  if (
    content.length < 24
    || content.toString('hex', 0, 8) !== '89504e470d0a1a0a'
    || content.readUInt32BE(16) !== expectedSize
    || content.readUInt32BE(20) !== expectedSize
  ) {
    errors.push(`${relativePath} must be a ${expectedSize}x${expectedSize} PNG`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const errors = verifyDesktopAssets()
  if (errors.length)
    throw new Error(errors.join('\n'))
  writeOutput('Lexora Buddy desktop assets passed')
}
