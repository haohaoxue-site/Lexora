import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'

import { writeOutput } from '../../shared/cli-output.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')
const appIconSource = join(repoRoot, 'packages/assets/brand/app-icon.png')
const outputRoot = join(repoRoot, 'apps/buddy/resources/icons')
const appSizes = [16, 24, 32, 48, 64, 96, 128, 256, 512]

export function generateBuddyIcons() {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'lexora-buddy-icons-'))
  try {
    const appWrapper = createEmbeddedPngSvg(appIconSource)
    const appWrapperPath = join(temporaryRoot, 'app-icon.svg')
    writeFileSync(appWrapperPath, appWrapper)
    rmSync(outputRoot, { force: true, recursive: true })

    for (const size of appSizes) {
      renderSvg(
        appWrapperPath,
        join(outputRoot, 'app', `${size}x${size}.png`),
        size,
      )
    }
  }
  finally {
    rmSync(temporaryRoot, { force: true, recursive: true })
  }
  writeOutput(`Lexora Buddy icons generated: ${outputRoot}`)
}

function createEmbeddedPngSvg(path) {
  const data = readFileSync(path).toString('base64')
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">',
    `<image width="512" height="512" href="data:image/png;base64,${data}" />`,
    '</svg>',
  ].join('')
}

function renderSvg(sourcePath, outputPath, size) {
  mkdirSync(resolve(outputPath, '..'), { recursive: true })
  const result = spawnSync('rsvg-convert', [
    '--format=png',
    `--width=${size}`,
    `--height=${size}`,
    `--output=${outputPath}`,
    sourcePath,
  ], { encoding: 'utf8' })
  if (result.error)
    throw new Error('rsvg-convert is required to generate Lexora Buddy icons', { cause: result.error })
  if (result.status !== 0)
    throw new Error(result.stderr.trim() || 'Lexora Buddy icon generation failed')
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname)
  generateBuddyIcons()
