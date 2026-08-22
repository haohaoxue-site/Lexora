import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'

import { writeOutput } from '../../shared/cli-output.mjs'
import { resolveBuddyOutputPaths } from './output-paths.mjs'
import {
  verifyBuddyDebArtifact,
  writeBuddyDebGithubEnv,
} from './verify-deb-package.mjs'
import { readBuddyPacmanReleaseMetadata } from './verify-pacman-package.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')
const checksumAssetName = 'SHA256SUMS.txt'

export function readBuddyArchReleaseMetadata(cwd = repoRoot) {
  return readBuddyPacmanReleaseMetadata(cwd)
}

export function verifyBuddyArchArtifact(options = {}) {
  const metadata = readBuddyArchReleaseMetadata(options.cwd)
  const archPath = options.archPath ?? metadata.archPath
  if (!existsSync(archPath))
    throw new Error(`Buddy Arch artifact does not exist: ${archPath}`)

  const hash = hashFile(archPath)
  return { ...metadata, archPath, hash }
}

export function verifyBuddyReleaseArtifacts(options = {}) {
  const cwd = options.cwd ?? repoRoot
  const checksumPath = options.checksumPath
    ?? join(resolveBuddyOutputPaths(cwd).outputRoot, 'artifacts', checksumAssetName)
  const deb = verifyBuddyDebArtifact({ cwd })
  const arch = verifyBuddyArchArtifact({ cwd })
  const checksumContents = [
    `${deb.hash}  ${deb.releaseAssetName}`,
    `${arch.hash}  ${arch.releaseAssetName}`,
    '',
  ].join('\n')

  mkdirSync(dirname(checksumPath), { recursive: true })
  writeFileSync(checksumPath, checksumContents)

  return {
    arch,
    checksum: {
      checksumPath,
      hash: createHash('sha256').update(checksumContents).digest('hex'),
      releaseAssetName: checksumAssetName,
    },
    deb,
  }
}

export function writeBuddyReleaseGithubEnv(path, metadata) {
  writeBuddyDebGithubEnv(path, metadata.deb)
  const entries = {
    LEXORA_BUDDY_ARCH_ASSET_NAME: metadata.arch.releaseAssetName,
    LEXORA_BUDDY_ARCH_PATH: metadata.arch.archPath,
    LEXORA_BUDDY_ARCH_SHA256: metadata.arch.hash,
    LEXORA_BUDDY_CHECKSUM_ASSET_NAME: metadata.checksum.releaseAssetName,
    LEXORA_BUDDY_CHECKSUM_PATH: metadata.checksum.checksumPath,
    LEXORA_BUDDY_CHECKSUM_SHA256: metadata.checksum.hash,
  }
  for (const [key, value] of Object.entries(entries)) {
    if (value.includes('\n') || value.includes('\r'))
      throw new Error(`invalid newline in GitHub environment value: ${key}`)
    appendFileSync(path, `${key}=${value}\n`)
  }
}

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function readOption(name) {
  const index = process.argv.indexOf(name)
  if (index < 0)
    return undefined
  const value = process.argv[index + 1]
  if (!value)
    throw new Error(`${name} requires a path`)
  return value
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const metadata = verifyBuddyReleaseArtifacts({ checksumPath: readOption('--checksum-output') })
  const githubEnvPath = readOption('--github-env')
  if (githubEnvPath)
    writeBuddyReleaseGithubEnv(githubEnvPath, metadata)
  writeOutput(
    `Buddy release artifacts passed: ${basename(metadata.deb.debPath)}, ${basename(metadata.arch.archPath)}, ${basename(metadata.checksum.checksumPath)}`,
  )
}
