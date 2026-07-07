import { join } from 'node:path'

import {
  parseBuddyProductVersion,
  parseCargoPackageVersion,
  parsePkgbuildArrayValue,
  parsePkgbuildValue,
  parseSrcinfoValue,
} from './buddy-version.mjs'

const repoUrl = 'https://github.com/haohaoxue-site/Lexora'

export function createLexoraBuddyReleaseMetadata(input) {
  const productVersion = parseBuddyProductVersion(input.buddyVersionJson)
  const pkgVersion = parsePkgbuildValue(input.pkgbuild, 'pkgver')
  const expectedHash = parsePkgbuildArrayValue(input.pkgbuild, 'sha256sums_x86_64')
  const srcinfoSource = parseSrcinfoValue(input.srcinfo, 'source_x86_64')
  const [sourceFileName = '', sourceUrl = ''] = srcinfoSource.split('::')
  const srcinfoHash = parseSrcinfoValue(input.srcinfo, 'sha256sums_x86_64')
  const buddyPackage = JSON.parse(input.buddyPackageJson)
  const tauriConfig = JSON.parse(input.tauriConfigJson)
  const cargoVersion = parseCargoPackageVersion(input.cargoToml)
  const productName = tauriConfig.productName ?? 'Lexora Buddy'
  const releaseTag = `v${productVersion}`
  const releaseAssetName = `${productName}_${productVersion}_amd64.deb`

  return {
    buddyPackageVersion: buddyPackage.version,
    cargoVersion,
    debPath: join(
      input.repoRoot,
      'apps/buddy/src-tauri/target/release/bundle/deb',
      releaseAssetName,
    ),
    expectedHash,
    expectedSourceFileName: `lexora-buddy-${productVersion}-amd64.deb`,
    expectedSourceUrl: `${repoUrl}/releases/download/${releaseTag}/${encodeURIComponent(releaseAssetName)}`,
    pkgVersion,
    productVersion,
    productName,
    releaseAssetName,
    releaseRepo: parseGithubReleaseRepo(sourceUrl),
    releaseTag,
    sourceFileName,
    sourceUrl,
    srcinfoHash,
    tauriVersion: tauriConfig.version,
  }
}

export function validateLexoraBuddyReleaseMetadata(metadata) {
  const errors = []

  if (!metadata.pkgVersion)
    errors.push('PKGBUILD pkgver is missing')
  if (!metadata.expectedHash)
    errors.push('PKGBUILD sha256sums_x86_64 is missing')
  if (metadata.srcinfoHash && metadata.expectedHash && metadata.srcinfoHash !== metadata.expectedHash) {
    errors.push(
      `.SRCINFO sha256sums_x86_64 ${metadata.srcinfoHash} does not match PKGBUILD ${metadata.expectedHash}`,
    )
  }
  if (metadata.pkgVersion !== metadata.productVersion) {
    errors.push(
      `PKGBUILD pkgver ${metadata.pkgVersion} does not match apps/buddy/buddy.version.json ${metadata.productVersion}`,
    )
  }
  if (metadata.buddyPackageVersion !== metadata.productVersion) {
    errors.push(
      `apps/buddy/package.json version ${metadata.buddyPackageVersion} does not match apps/buddy/buddy.version.json ${metadata.productVersion}`,
    )
  }
  if (metadata.tauriVersion !== metadata.productVersion) {
    errors.push(
      `apps/buddy/src-tauri/tauri.conf.json version ${metadata.tauriVersion} does not match apps/buddy/buddy.version.json ${metadata.productVersion}`,
    )
  }
  if (metadata.cargoVersion !== metadata.productVersion) {
    errors.push(
      `apps/buddy/src-tauri/Cargo.toml version ${metadata.cargoVersion} does not match apps/buddy/buddy.version.json ${metadata.productVersion}`,
    )
  }
  if (metadata.sourceFileName !== metadata.expectedSourceFileName) {
    errors.push(
      `source_x86_64 filename ${metadata.sourceFileName} does not match ${metadata.expectedSourceFileName}`,
    )
  }
  if (metadata.sourceUrl !== metadata.expectedSourceUrl) {
    errors.push(
      `source_x86_64 URL ${metadata.sourceUrl} does not match ${metadata.expectedSourceUrl}`,
    )
  }

  return errors
}

export function selectLexoraBuddyPackageArchive(entries, metadata) {
  const prefix = `lexora-buddy-bin-${metadata.pkgVersion}-`
  const matches = entries
    .filter(entry => entry.startsWith(prefix))
    .filter(entry => /\.pkg\.tar\.(?:zst|xz|gz)$/.test(entry))
    .sort()

  if (matches.length === 0) {
    throw new Error(
      `Unable to find lexora-buddy-bin pacman package archive for ${metadata.pkgVersion}`,
    )
  }

  if (matches.length > 1) {
    throw new Error(
      `Expected one lexora-buddy-bin pacman package archive for ${metadata.pkgVersion}, found ${matches.length}`,
    )
  }

  return matches[0]
}

function parseGithubReleaseRepo(url) {
  return url.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/download\//)?.[1] ?? ''
}
