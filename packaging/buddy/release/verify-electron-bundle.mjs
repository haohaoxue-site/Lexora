import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

import { writeOutput } from '../../shared/cli-output.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')
const electronBundleRoot = 'apps/buddy/.output/build/electron'
const bundlePaths = [
  `${electronBundleRoot}/main/index.js`,
  `${electronBundleRoot}/main/buddy-service.js`,
  `${electronBundleRoot}/preload/index.cjs`,
]
const electronExternalBundlePaths = [
  `${electronBundleRoot}/main/index.js`,
  `${electronBundleRoot}/preload/index.cjs`,
]
const forbiddenFragments = [
  'Downloading Electron binary',
  'node_modules/electron/index.js',
  'out/main/install.js',
]

export function verifyElectronBundle(cwd = repoRoot) {
  const errors = []

  for (const relativePath of bundlePaths) {
    const content = readFileSync(resolve(cwd, relativePath), 'utf8')
    for (const fragment of forbiddenFragments) {
      if (content.includes(fragment))
        errors.push(`${relativePath} bundled forbidden Electron bootstrap code: ${fragment}`)
    }
  }

  for (const relativePath of electronExternalBundlePaths) {
    const content = readFileSync(resolve(cwd, relativePath), 'utf8')
    if (!content.includes('from "electron"') && !content.includes('require("electron")'))
      errors.push(`${relativePath} does not keep Electron as a runtime external`)
  }

  const preloadPath = `${electronBundleRoot}/preload/index.cjs`
  const preload = readFileSync(resolve(cwd, preloadPath), 'utf8')
  if (!preload.includes('require("electron")') || preload.includes('from "electron"'))
    errors.push(`${preloadPath} must be a CommonJS sandbox preload`)

  const buddyService = readFileSync(
    resolve(cwd, `${electronBundleRoot}/main/buddy-service.js`),
    'utf8',
  )
  if (!buddyService.includes('.parentPort'))
    errors.push('Buddy Local Service bundle does not use the utility process parent port')
  if (buddyService.includes('from "electron"') || buddyService.includes('require("electron")'))
    errors.push('Buddy Local Service bundle must use process.parentPort without importing Electron')
  for (const fragment of [
    'ModelRuntime',
    'createAgentSession',
    'host.credentials.read',
    'mcp__',
    'providers.list',
  ]) {
    if (!buddyService.includes(fragment))
      errors.push(`Buddy Local Service bundle is missing Pi boundary marker: ${fragment}`)
  }
  if (!buddyService.includes('Select OpenAI Codex login method:'))
    errors.push('Buddy Local Service bundle is missing statically registered Provider OAuth flows')
  for (const fragment of ['lexora-buddy-runtime', 'codex exec', 'apps/buddy/runtime']) {
    if (buddyService.includes(fragment))
      errors.push(`Buddy Local Service bundle contains removed Rust runtime marker: ${fragment}`)
  }

  const rendererPath = `${electronBundleRoot}/renderer/index.html`
  const rendererHtml = readFileSync(resolve(cwd, rendererPath), 'utf8')
  if (/connect-src[^;]*(?:localhost|127\.0\.0\.1)/.test(rendererHtml))
    errors.push(`${rendererPath} allows development WebSocket origins`)

  return errors
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const errors = verifyElectronBundle()
  if (errors.length)
    throw new Error(errors.join('\n'))

  writeOutput('Electron bundle boundary check passed')
}
