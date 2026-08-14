import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

import { writeOutput } from '../../shared/cli-output.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')
const appSizes = [16, 24, 32, 48, 64, 96, 128, 256, 512]

export function verifyDesktopAssets(cwd = repoRoot) {
  const errors = []
  const appSource = 'packages/assets/brand/app-icon.png'
  requireFile(cwd, appSource, errors)
  if (existsSync(join(cwd, appSource)))
    verifyPng(cwd, appSource, 512, errors)

  for (const size of appSizes) {
    verifyPng(
      cwd,
      `apps/buddy/resources/icons/app/${size}x${size}.png`,
      size,
      errors,
    )
  }

  for (const legacy of [
    'apps/buddy/resources/icons/icon.png',
    'apps/buddy/resources/icons/128x128.png',
    'apps/buddy/resources/icons/128x128@2x.png',
    'apps/buddy/resources/icons/32x32.png',
  ]) {
    if (existsSync(join(cwd, legacy)))
      errors.push(`${legacy} is a legacy icon output`)
  }
  return errors
}

function requireFile(cwd, relativePath, errors) {
  if (!existsSync(join(cwd, relativePath)))
    errors.push(`${relativePath} is missing`)
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
