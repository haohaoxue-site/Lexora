import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { get as httpsGet } from 'node:https'
import { resolve } from 'node:path'
import process from 'node:process'

import { writeError, writeOutput } from '../../shared/cli-output.mjs'

const DEFAULT_DOWNLOAD_TIMEOUT_MS = 30_000
const DEFAULT_MAX_ASSET_BYTES = 1_000_000_000
const DEFAULT_MAX_REDIRECTS = 5

export async function verifyLexoraBuddyRemoteAsset(metadata, downloadAsset = downloadHttpsAsset) {
  const content = await downloadAsset(metadata.sourceUrl)
  const hash = createHash('sha256').update(content).digest('hex')
  if (hash !== metadata.expectedHash)
    throw new Error('remote asset sha256 does not match expected release metadata')

  return {
    byteLength: content.byteLength,
    hash,
    releaseAssetName: metadata.releaseAssetName,
    sourceUrl: metadata.sourceUrl,
  }
}

export function downloadHttpsAsset(sourceUrl, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS
  const maxAssetBytes = options.maxAssetBytes ?? DEFAULT_MAX_ASSET_BYTES
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  const getImpl = options.getImpl ?? httpsGet

  return download(sourceUrl, maxRedirects)

  function download(url, redirectsRemaining) {
    return new Promise((resolveDownload, rejectDownload) => {
      const request = getImpl(url, (response) => {
        const statusCode = response.statusCode ?? 0
        const location = response.headers?.location
        if (statusCode >= 300 && statusCode < 400 && location) {
          response.resume()
          if (redirectsRemaining <= 0) {
            rejectDownload(new Error('remote asset download exceeded the redirect limit'))
            return
          }
          const redirectedUrl = new URL(location, url)
          if (redirectedUrl.protocol !== 'https:') {
            rejectDownload(new Error('remote asset redirect must use https'))
            return
          }
          download(redirectedUrl.href, redirectsRemaining - 1).then(resolveDownload, rejectDownload)
          return
        }
        if (statusCode !== 200) {
          response.resume()
          rejectDownload(new Error(`remote asset download returned HTTP ${statusCode}`))
          return
        }

        const chunks = []
        let byteLength = 0
        response.on('data', (chunk) => {
          byteLength += chunk.length
          if (byteLength > maxAssetBytes) {
            request.destroy(new Error(`remote asset exceeds ${maxAssetBytes} bytes`))
            return
          }
          chunks.push(chunk)
        })
        response.once('end', () => resolveDownload(Buffer.concat(chunks)))
      })
      request.setTimeout(timeoutMs, () => {
        request.destroy(new Error(`remote asset download timed out after ${timeoutMs}ms`))
      })
      request.on('error', rejectDownload)
    })
  }
}

async function main() {
  const result = await verifyLexoraBuddyRemoteAsset(readRemoteAssetMetadata())
  writeOutput(`Buddy remote release asset passed: ${result.releaseAssetName} (${result.byteLength} bytes)`)
}

export function readRemoteAssetMetadata(options = {}) {
  const asset = options.asset ?? readAssetOption()
  const env = options.env ?? process.env
  const definitions = {
    deb: ['LEXORA_BUDDY_RELEASE_ASSET_NAME', 'LEXORA_BUDDY_DEB_SHA256'],
    arch: ['LEXORA_BUDDY_ARCH_ASSET_NAME', 'LEXORA_BUDDY_ARCH_SHA256'],
    checksums: ['LEXORA_BUDDY_CHECKSUM_ASSET_NAME', 'LEXORA_BUDDY_CHECKSUM_SHA256'],
  }
  const definition = definitions[asset]
  if (!definition)
    throw new Error(`unsupported release asset: ${asset}`)

  const [nameKey, hashKey] = definition
  const releaseAssetName = env[nameKey]
  const expectedHash = env[hashKey]
  const releaseRepo = env.LEXORA_BUDDY_RELEASE_REPO
  const releaseTag = env.LEXORA_BUDDY_RELEASE_TAG
  if (!releaseAssetName || !expectedHash)
    throw new Error(`${asset} release asset metadata is missing from the environment`)
  if (!releaseRepo || !releaseTag)
    throw new Error('release repository or tag is missing from the environment')
  if (!/^[a-f\d]{64}$/.test(expectedHash))
    throw new Error(`${asset} release asset sha256 is invalid`)

  return {
    expectedHash,
    releaseAssetName,
    sourceUrl: `https://github.com/${releaseRepo}/releases/download/${releaseTag}/${releaseAssetName}`,
  }
}

function readAssetOption() {
  const index = process.argv.indexOf('--asset')
  if (index < 0)
    return 'deb'
  const value = process.argv[index + 1]
  if (!value)
    throw new Error('--asset requires deb, arch or checksums')
  return value
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  void main().catch((error) => {
    writeError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
