import { createHash } from 'node:crypto'
import { appendFileSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { writeError, writeOutput } from '../../shared/cli-output.mjs'
import {
  createLexoraBuddyReleaseMetadata,
  validateLexoraBuddyReleaseMetadata,
} from '../release/metadata.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

export function verifyLocalLexoraBuddyDebAsset(options = {}) {
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

  const debBytes = readFileSync(metadata.debPath)
  const actualHash = createHash('sha256').update(debBytes).digest('hex')

  if (actualHash !== metadata.expectedHash) {
    throw new Error(
      `local deb hash does not match PKGBUILD: ${actualHash} !== ${metadata.expectedHash}`,
    )
  }

  return {
    debPath: metadata.debPath,
    hash: actualHash,
    releaseAssetName: metadata.releaseAssetName,
    releaseRepo: metadata.releaseRepo,
    releaseTag: metadata.releaseTag,
    sourceUrl: metadata.sourceUrl,
  }
}

export function writeBuddyDebGithubEnv(envPath, result) {
  appendFileSync(envPath, [
    `LEXORA_BUDDY_DEB_PATH=${result.debPath}`,
    `LEXORA_BUDDY_RELEASE_ASSET_NAME=${result.releaseAssetName}`,
    `LEXORA_BUDDY_DEB_SHA256=${result.hash}`,
    `LEXORA_BUDDY_RELEASE_REPO=${result.releaseRepo}`,
    `LEXORA_BUDDY_RELEASE_TAG=${result.releaseTag}`,
    '',
  ].join('\n'))
}

export function runLocalLexoraBuddyDebAssetCheck(options = {}) {
  const result = verifyLocalLexoraBuddyDebAsset(options)

  if (options.githubEnvPath)
    writeBuddyDebGithubEnv(options.githubEnvPath, result)

  writeOutput(`local deb release asset check passed: ${result.hash} ${result.releaseAssetName}`)

  return result
}

function readCliOptions(argv) {
  const githubEnvIndex = argv.indexOf('--github-env')

  return {
    githubEnvPath: githubEnvIndex === -1 ? undefined : argv[githubEnvIndex + 1],
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runLocalLexoraBuddyDebAssetCheck(readCliOptions(process.argv.slice(2)))
  }
  catch (error) {
    writeError(error.message)
    process.exit(1)
  }
}
