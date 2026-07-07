import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { get } from 'node:https'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { writeError, writeOutput } from '../../shared/cli-output.mjs'
import {
  createLexoraBuddyReleaseMetadata,
  validateLexoraBuddyReleaseMetadata,
} from './metadata.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../../..')

export async function verifyLexoraBuddyRemoteAsset(metadata, downloadAsset) {
  const content = await downloadAsset(metadata.sourceUrl)
  const hash = createHash('sha256').update(content).digest('hex')

  if (hash !== metadata.expectedHash) {
    throw new Error(
      `remote asset hash does not match PKGBUILD: ${hash} !== ${metadata.expectedHash}`,
    )
  }

  return {
    byteLength: content.byteLength,
    hash,
    releaseAssetName: metadata.releaseAssetName,
    sourceUrl: metadata.sourceUrl,
  }
}

export async function runBuddyReleaseAssetCheck(options = {}) {
  const cwd = options.cwd ?? repoRoot
  const metadata = createLexoraBuddyReleaseMetadata({
    buddyVersionJson: readFileSync(join(cwd, 'apps/buddy/buddy.version.json'), 'utf8'),
    buddyPackageJson: readFileSync(join(cwd, 'apps/buddy/package.json'), 'utf8'),
    cargoToml: readFileSync(join(cwd, 'apps/buddy/src-tauri/Cargo.toml'), 'utf8'),
    pkgbuild: readFileSync(join(cwd, 'packaging/buddy/aur/lexora-buddy-bin/PKGBUILD'), 'utf8'),
    repoRoot: cwd,
    srcinfo: readFileSync(join(cwd, 'packaging/buddy/aur/lexora-buddy-bin/.SRCINFO'), 'utf8'),
    tauriConfigJson: readFileSync(join(cwd, 'apps/buddy/src-tauri/tauri.conf.json'), 'utf8'),
  })
  const metadataErrors = validateLexoraBuddyReleaseMetadata(metadata)

  if (metadataErrors.length > 0)
    throw new Error(metadataErrors.join('\n'))

  const result = await verifyLexoraBuddyRemoteAsset(
    metadata,
    options.downloadAsset ?? downloadHttpsAsset,
  )

  writeOutput(`remote release asset check passed: ${result.hash} ${result.releaseAssetName}`)
}

export function downloadHttpsAsset(url, options = {}, redirectCount = 0) {
  if (typeof options === 'number')
    return downloadHttpsAsset(url, {}, options)

  if (redirectCount > 5)
    return Promise.reject(new Error(`too many redirects for ${url}`))

  const getImpl = options.getImpl ?? get
  const timeoutMs = options.timeoutMs ?? 10000

  return new Promise((resolveDownload, rejectDownload) => {
    const request = getImpl(url, (response) => {
      const statusCode = response.statusCode ?? 0
      const location = response.headers.location

      if (statusCode >= 300 && statusCode < 400 && location) {
        response.resume()
        const redirectUrl = new URL(location, url).toString()
        downloadHttpsAsset(redirectUrl, options, redirectCount + 1)
          .then(resolveDownload)
          .catch(rejectDownload)
        return
      }

      if (statusCode !== 200) {
        response.resume()
        rejectDownload(new Error(`failed to download ${url}: HTTP ${statusCode}`))
        return
      }

      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => resolveDownload(Buffer.concat(chunks)))
      response.on('error', rejectDownload)
    })

    request.setTimeout?.(timeoutMs, () => {
      request.destroy(new Error(`remote asset download timed out after ${timeoutMs}ms`))
    })
    request.on('error', rejectDownload)
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBuddyReleaseAssetCheck().catch((error) => {
    writeError(error.message)
    process.exit(1)
  })
}
