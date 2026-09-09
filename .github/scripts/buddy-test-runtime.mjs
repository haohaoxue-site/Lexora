import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { nativeHostResources, prepareNativeHost } from '../../packaging/buddy/release/native-host.mjs'

const archive = process.argv[2]
if (!archive || process.argv.length !== 3)
  throw new Error('Usage: buddy-test-runtime.mjs <archive>')

prepareNativeHost()
execFileSync('tar', [
  '-cf',
  resolve(archive),
  '-C',
  fileURLToPath(new URL('../../apps/buddy/', import.meta.url)),
  ...nativeHostResources(process.platform, process.arch).map(resource => resource.from),
], { stdio: 'inherit' })
