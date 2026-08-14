import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

import { writeOutput } from '../../shared/cli-output.mjs'
import { resolveBuddyOutputPaths } from '../release/output-paths.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')

export function readBuddyDebReleaseMetadata(cwd = repoRoot) {
  const version = String(JSON.parse(
    readFileSync(join(cwd, 'apps/buddy/buddy.version.json'), 'utf8'),
  ).version)
  const pkgbuild = readFileSync(
    join(cwd, 'packaging/buddy/aur/lexora-buddy-bin/PKGBUILD'),
    'utf8',
  )
  const releaseUrl = readQuotedAssignment(pkgbuild, 'url')
  const expectedHash = pkgbuild.match(
    /^_deb_sha256="\$\{LEXORA_BUDDY_DEB_SHA256:-([a-f\d]{64})\}"$/m,
  )?.[1]
  if (!releaseUrl || !expectedHash)
    throw new Error('AUR PKGBUILD is missing the release URL or deb sha256')

  const releaseAssetName = `Lexora-Buddy-${version}-linux-amd64.deb`
  const sourceUrl = `${releaseUrl}/releases/download/v${version}/${releaseAssetName}`
  const releaseRepo = new URL(releaseUrl).pathname.replace(/^\//, '')

  return {
    debPath: join(resolveBuddyOutputPaths(cwd).artifacts.desktop, releaseAssetName),
    expectedHash,
    releaseAssetName,
    releaseRepo,
    releaseTag: `v${version}`,
    sourceUrl,
  }
}

export function verifyBuddyDebArtifact(options = {}) {
  const metadata = readBuddyDebReleaseMetadata(options.cwd)
  const debPath = options.debPath ?? metadata.debPath
  if (!existsSync(debPath))
    throw new Error(`Buddy deb artifact does not exist: ${debPath}`)

  const hash = createHash('sha256').update(readFileSync(debPath)).digest('hex')
  if (hash !== metadata.expectedHash) {
    throw new Error(
      `Buddy deb sha256 does not match AUR PKGBUILD: expected ${metadata.expectedHash}, received ${hash}`,
    )
  }

  return { ...metadata, debPath, hash }
}

export function writeBuddyDebGithubEnv(path, metadata) {
  const entries = {
    LEXORA_BUDDY_DEB_PATH: metadata.debPath,
    LEXORA_BUDDY_DEB_SHA256: metadata.hash,
    LEXORA_BUDDY_RELEASE_ASSET_NAME: metadata.releaseAssetName,
    LEXORA_BUDDY_RELEASE_REPO: metadata.releaseRepo,
    LEXORA_BUDDY_RELEASE_SOURCE_URL: metadata.sourceUrl,
    LEXORA_BUDDY_RELEASE_TAG: metadata.releaseTag,
  }
  for (const [key, value] of Object.entries(entries)) {
    if (value.includes('\n') || value.includes('\r'))
      throw new Error(`invalid newline in GitHub environment value: ${key}`)
    appendFileSync(path, `${key}=${value}\n`)
  }
}

function readQuotedAssignment(source, key) {
  return source.match(new RegExp(`^${key}="([^"]+)"$`, 'm'))?.[1] ?? ''
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const githubEnvIndex = process.argv.indexOf('--github-env')
  const metadata = verifyBuddyDebArtifact()
  if (githubEnvIndex >= 0) {
    const githubEnvPath = process.argv[githubEnvIndex + 1]
    if (!githubEnvPath)
      throw new Error('--github-env requires a path')
    writeBuddyDebGithubEnv(githubEnvPath, metadata)
  }
  writeOutput(`Buddy deb release artifact passed: ${metadata.releaseAssetName}`)
}
