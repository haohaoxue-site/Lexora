import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { writeError, writeOutput } from '../../shared/cli-output.mjs'
import {
  createLexoraBuddyReleaseMetadata,
  selectLexoraBuddyPackageArchive,
  validateLexoraBuddyReleaseMetadata,
} from '../release/metadata.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../../..')
const packageDir = join(scriptDir, 'lexora-buddy-bin')
const pkgbuildPath = join(packageDir, 'PKGBUILD')
const srcinfoPath = join(packageDir, '.SRCINFO')
const installPath = join(packageDir, 'lexora-buddy-bin.install')
const pkgbuild = readFileSync(pkgbuildPath, 'utf8')
const srcinfo = readFileSync(srcinfoPath, 'utf8')
const metadata = createLexoraBuddyReleaseMetadata({
  buddyVersionJson: readFileSync(join(repoRoot, 'apps/buddy/buddy.version.json'), 'utf8'),
  buddyPackageJson: readFileSync(join(repoRoot, 'apps/buddy/package.json'), 'utf8'),
  cargoToml: readFileSync(join(repoRoot, 'apps/buddy/src-tauri/Cargo.toml'), 'utf8'),
  pkgbuild,
  repoRoot,
  srcinfo,
  tauriConfigJson: readFileSync(join(repoRoot, 'apps/buddy/src-tauri/tauri.conf.json'), 'utf8'),
})
const metadataErrors = validateLexoraBuddyReleaseMetadata(metadata)

if (metadataErrors.length > 0)
  fail(metadataErrors.join('\n'))

const debPath = metadata.debPath
const actualHash = createHash('sha256').update(readFileSync(debPath)).digest('hex')

if (actualHash !== metadata.expectedHash) {
  fail(`deb hash 不匹配。当前 hash: ${actualHash}，PKGBUILD: ${metadata.expectedHash}`)
}

const generatedSrcinfo = run('makepkg', ['--printsrcinfo'], { cwd: packageDir })

if (normalizeText(generatedSrcinfo) !== normalizeText(srcinfo)) {
  fail('.SRCINFO 与 makepkg --printsrcinfo 输出不一致')
}

const control = readDebMember('control.tar.gz', ['-xOf', '-', './control'])
const dataList = readDebMember('data.tar.gz', ['-tf', '-'])
const desktopFile = readDebMember('data.tar.gz', [
  '-xOf',
  '-',
  'usr/share/applications/Lexora Buddy.desktop',
])

assertIncludes(control, 'Package: lexora-buddy')
assertIncludes(control, `Version: ${metadata.pkgVersion}`)
assertIncludes(control, 'Architecture: amd64')
assertIncludes(control, 'libwebkit2gtk-4.1-0')
assertIncludes(control, 'libgtk-3-0')
assertIncludes(control, 'libgtk-layer-shell0')
assertIncludes(dataList, 'usr/bin/lexora-buddy')
assertIncludes(dataList, 'usr/share/applications/Lexora Buddy.desktop')
assertIncludes(dataList, 'usr/share/icons/hicolor/32x32/apps/lexora-buddy.png')
assertIncludes(dataList, 'usr/share/icons/hicolor/128x128/apps/lexora-buddy.png')
assertIncludes(dataList, 'usr/share/icons/hicolor/256x256/apps/lexora-buddy.png')
assertIncludes(desktopFile, 'Exec=lexora-buddy')
assertIncludes(desktopFile, 'Icon=lexora-buddy')

verifyMakepkgBuild()

writeOutput(`lexora-buddy-bin package verification passed: ${actualHash}`)

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: 'pipe',
    ...options,
  })

  if (result.status === 0)
    return result.stdout ?? ''

  const stderr = result.stderr?.toString() ?? ''
  const stdout = result.stdout?.toString() ?? ''
  const error = result.error?.message ?? ''
  fail([stdout, stderr, error].filter(Boolean).join('\n') || `${command} failed`)
}

function readDebMember(member, bsdtarArgs) {
  const ar = spawnSync('ar', ['p', debPath, member], {
    encoding: 'buffer',
    maxBuffer: 256 * 1024 * 1024,
  })

  if (ar.status !== 0) {
    fail(ar.stderr?.toString() || `ar failed for ${member}`)
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'lexora-buddy-deb-member-'))
  const memberPath = join(tempDir, member)
  try {
    writeFileSync(memberPath, ar.stdout)
    const bsdtar = spawnSync('bsdtar', bsdtarArgs.map(arg => arg === '-' ? memberPath : arg), {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })

    if (bsdtar.status !== 0)
      fail(bsdtar.stderr || `bsdtar failed for ${member}`)

    return bsdtar.stdout
  }
  finally {
    rmSync(tempDir, { force: true, recursive: true })
  }
}

function assertIncludes(content, expected) {
  if (!content.includes(expected))
    fail(`缺少预期内容：${expected}`)
}

function normalizeText(content) {
  return content.trim().replace(/\r\n/g, '\n')
}

function verifyMakepkgBuild() {
  const tempDir = mkdtempSync(join(tmpdir(), 'lexora-buddy-bin-'))
  try {
    copyFileSync(pkgbuildPath, join(tempDir, 'PKGBUILD'))
    copyFileSync(srcinfoPath, join(tempDir, '.SRCINFO'))
    copyFileSync(installPath, join(tempDir, 'lexora-buddy-bin.install'))
    copyFileSync(debPath, join(tempDir, metadata.sourceFileName))

    run('makepkg', [
      '--force',
      '--nodeps',
      '--skippgpcheck',
      '--clean',
      '--noconfirm',
    ], {
      cwd: tempDir,
      stdio: 'inherit',
    })

    verifyPackageBinaryHealthCheck(tempDir)
  }
  finally {
    rmSync(tempDir, { force: true, recursive: true })
  }
}

function verifyPackageBinaryHealthCheck(tempDir) {
  const packageArchive = selectLexoraBuddyPackageArchive(readdirSync(tempDir), metadata)
  const extractDir = join(tempDir, 'pkg-root')
  const healthDataDir = join(tempDir, 'health-data')

  mkdirSync(extractDir)
  run('bsdtar', ['-xf', join(tempDir, packageArchive), '-C', extractDir], {
    cwd: tempDir,
  })
  const healthCheckOutput = runHealthCheck(join(extractDir, 'usr/bin/lexora-buddy'), [
    '--buddy-health-check',
    '--buddy-health-check-data-dir',
    healthDataDir,
  ], tempDir)

  assertIncludes(healthCheckOutput, '"ok":true')
}

function runHealthCheck(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  })

  if (result.status === 0)
    return result.stdout

  fail([result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n'))
}

function fail(message) {
  writeError(message)
  process.exit(1)
}
