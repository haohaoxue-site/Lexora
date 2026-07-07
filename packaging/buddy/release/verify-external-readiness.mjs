import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { writeError as writeCliError, writeOutput as writeCliOutput } from '../../shared/cli-output.mjs'
import {
  createLexoraBuddyReleaseMetadata,
  validateLexoraBuddyReleaseMetadata,
} from './metadata.mjs'
import {
  downloadHttpsAsset,
  verifyLexoraBuddyRemoteAsset,
} from './verify-remote-asset.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

export function createBuddyExternalReadinessReport(input) {
  const items = [
    createGithubCliItem(input.gh),
    createGithubReleaseItem(input.githubRelease),
    createRemoteDebAssetItem(input.remoteDebAsset),
    createManualItem(
      'linux-deb-workflow-run',
      input.linuxDebWorkflowVerified,
      'Linux deb workflow artifact/upload has been verified',
      'trigger .github/workflows/buddy-linux-deb.yml and verify the deb artifact/upload',
      input.linuxDebWorkflowEvidence,
    ),
    input.aurInstallVerified
      ? {
          detail: formatVerifiedDetail(
            'AUR makepkg -si has been verified against the release asset',
            input.aurInstallEvidence,
          ),
          id: 'aur-install',
          status: 'passed',
        }
      : {
          detail: input.remoteDebAsset.ok
            ? 'trigger .github/workflows/buddy-aur-install.yml or run makepkg -si from packaging/buddy/aur/lexora-buddy-bin'
            : 'AUR makepkg -si requires the remote deb release asset first',
          id: 'aur-install',
          status: input.remoteDebAsset.ok ? 'manual' : 'blocked',
        },
    createGuiSmokeItem({
      guiSmokeEvidence: input.guiSmokeEvidence,
      guiSmokeVerified: input.guiSmokeVerified,
      xvfbRunInstalled: input.xvfbRunInstalled,
    }),
    createManualItem(
      'windows-nsis-workflow-run',
      input.windowsNsisWorkflowVerified,
      'Windows NSIS workflow artifact has been verified',
      'trigger .github/workflows/buddy-windows.yml and verify the NSIS artifact',
      input.windowsNsisWorkflowEvidence,
    ),
  ]

  return {
    items,
    ready: items.every(item => item.status === 'passed' || item.status === 'info'),
  }
}

export async function probeBuddyExternalReadiness(options = {}) {
  const cwd = options.cwd ?? repoRoot
  const metadata = readLexoraBuddyReleaseMetadata(cwd)
  const evidenceOptions = loadExternalReadinessEvidenceOptions(options.evidencePaths ?? [], cwd)
  validateExternalReadinessEvidenceRelease(evidenceOptions.release, metadata)
  const readinessOptions = mergeExternalReadinessOptions(evidenceOptions, options)

  return createBuddyExternalReadinessReport({
    aurInstallEvidence: readinessOptions.aurInstallEvidence,
    aurInstallVerified: readinessOptions.aurInstallVerified,
    gh: probeGithubCli(),
    guiSmokeEvidence: readinessOptions.guiSmokeEvidence,
    guiSmokeVerified: readinessOptions.guiSmokeVerified,
    githubRelease: await probeGithubRelease(metadata, options.fetchRelease),
    linuxDebWorkflowEvidence: readinessOptions.linuxDebWorkflowEvidence,
    linuxDebWorkflowVerified: readinessOptions.linuxDebWorkflowVerified,
    remoteDebAsset: await probeRemoteDebAsset(metadata, options.downloadAsset),
    windowsNsisWorkflowEvidence: readinessOptions.windowsNsisWorkflowEvidence,
    windowsNsisWorkflowVerified: readinessOptions.windowsNsisWorkflowVerified,
    xvfbRunInstalled: commandExists('xvfb-run'),
  })
}

export function createExternalReadinessEvidenceTemplate(metadata) {
  return {
    aurInstall: {
      evidence: '',
      verified: false,
    },
    guiSmoke: {
      evidence: '',
      verified: false,
    },
    linuxDebWorkflow: {
      evidence: '',
      verified: false,
    },
    release: {
      assetName: metadata.releaseAssetName,
      releaseRepo: metadata.releaseRepo,
      sha256: metadata.expectedHash,
      sourceUrl: metadata.sourceUrl,
      version: metadata.pkgVersion,
    },
    windowsNsisWorkflow: {
      evidence: '',
      verified: false,
    },
  }
}

export function createExternalReadinessEvidenceTemplateFromWorkspace(cwd = repoRoot) {
  return createExternalReadinessEvidenceTemplate(readLexoraBuddyReleaseMetadata(cwd))
}

export function formatBuddyExternalReadinessReport(report) {
  const lines = [
    report.ready
      ? 'Buddy external readiness passed'
      : 'Buddy external readiness is not complete',
    ...report.items.map(item => `[${item.status}] ${item.id}: ${item.detail}`),
  ]

  return lines.join('\n')
}

export async function runBuddyExternalReadinessCheck(options = {}) {
  const report = await probeBuddyExternalReadiness(options)

  if (options.json) {
    writeCliOutput(JSON.stringify(report, null, 2))
  }
  else {
    writeCliOutput(formatBuddyExternalReadinessReport(report))
  }

  if (!report.ready && !options.allowIncomplete)
    throw new Error('Buddy external readiness is not complete')

  return report
}

function createGithubCliItem(gh) {
  if (!gh.installed) {
    return {
      detail: 'gh is not installed; use GitHub web UI, CI, or install gh for optional local release operations',
      id: 'github-cli',
      status: 'info',
    }
  }

  if (!gh.authenticated) {
    return {
      detail: 'gh is installed but not authenticated; authenticate it only if you want local release operations',
      id: 'github-cli',
      status: 'info',
    }
  }

  return {
    detail: 'gh is installed and authenticated for optional local release operations',
    id: 'github-cli',
    status: 'info',
  }
}

function createManualItem(id, verified, passedDetail, manualDetail, evidence) {
  return {
    detail: verified ? formatVerifiedDetail(passedDetail, evidence) : manualDetail,
    id,
    status: verified ? 'passed' : 'manual',
  }
}

function formatVerifiedDetail(detail, evidence) {
  return evidence ? `${detail}: ${evidence}` : detail
}

function createGithubReleaseItem(githubRelease) {
  if (githubRelease?.ok) {
    return {
      detail: `GitHub Release ${githubRelease.tag} exists in ${githubRelease.releaseRepo}`,
      id: 'github-release',
      status: 'passed',
    }
  }

  if (githubRelease && githubRelease.error !== 'HTTP 404') {
    return {
      detail: `GitHub Release ${githubRelease.tag} API check is inconclusive in ${githubRelease.releaseRepo}: ${githubRelease.error}; remote deb asset proof remains authoritative`,
      id: 'github-release',
      status: 'info',
    }
  }

  return {
    detail: githubRelease
      ? `GitHub Release ${githubRelease.tag} is not ready in ${githubRelease.releaseRepo}: ${githubRelease.error}`
      : 'GitHub Release has not been checked',
    id: 'github-release',
    status: 'blocked',
  }
}

function createRemoteDebAssetItem(remoteDebAsset) {
  if (remoteDebAsset.ok) {
    return {
      detail: 'remote deb asset is reachable and hash-checked',
      id: 'remote-deb-asset',
      status: 'passed',
    }
  }

  return {
    detail: `remote deb asset is not ready: ${remoteDebAsset.error}`,
    id: 'remote-deb-asset',
    status: 'blocked',
  }
}

function createGuiSmokeItem(input) {
  if (input.guiSmokeVerified) {
    return {
      detail: formatVerifiedDetail(
        'Required GUI smoke has been verified',
        input.guiSmokeEvidence,
      ),
      id: 'gui-smoke',
      status: 'passed',
    }
  }

  if (input.xvfbRunInstalled) {
    return {
      detail: 'run node packaging/buddy/ci/run-gui-smoke.mjs --required, then re-run with --gui-smoke-verified',
      id: 'gui-smoke',
      status: 'manual',
    }
  }

  return {
    detail: 'install xvfb-run or verify the required GUI smoke on CI with --gui-smoke-verified',
    id: 'gui-smoke',
    status: 'blocked',
  }
}

export function parseExternalReadinessEvidence(content) {
  const evidence = parseJsonObject(content)
  const options = {}
  let hasVerifiedExternalProof = false

  for (const item of [
    {
      evidenceKey: 'linuxDebWorkflowEvidence',
      key: 'linuxDebWorkflow',
      verifiedKey: 'linuxDebWorkflowVerified',
    },
    {
      evidenceKey: 'windowsNsisWorkflowEvidence',
      key: 'windowsNsisWorkflow',
      verifiedKey: 'windowsNsisWorkflowVerified',
    },
    {
      evidenceKey: 'aurInstallEvidence',
      key: 'aurInstall',
      verifiedKey: 'aurInstallVerified',
    },
    {
      evidenceKey: 'guiSmokeEvidence',
      key: 'guiSmoke',
      verifiedKey: 'guiSmokeVerified',
    },
  ]) {
    const record = evidence[item.key]

    if (record === undefined)
      continue

    if (!isPlainObject(record))
      throw new Error(`${item.key} must be an object`)

    if (typeof record.verified !== 'boolean')
      throw new Error(`${item.key}.verified must be a boolean`)

    if (!record.verified)
      continue

    hasVerifiedExternalProof = true

    const evidenceText = typeof record.evidence === 'string'
      ? record.evidence.trim()
      : ''

    if (!evidenceText)
      throw new Error(`${item.key} evidence is required when verified is true`)

    options[item.verifiedKey] = true
    options[item.evidenceKey] = evidenceText
  }

  if (evidence.release !== undefined && (hasVerifiedExternalProof || hasNonEmptyObjectValue(evidence.release)))
    options.release = parseExternalReadinessReleaseEvidence(evidence.release)

  if (hasVerifiedExternalProof && options.release === undefined) {
    throw new Error(
      'release metadata is required when external readiness evidence verifies any item',
    )
  }

  return options
}

export function mergeExternalReadinessEvidenceOptions(evidenceOptionsList) {
  const merged = {}

  for (const evidenceOptions of evidenceOptionsList) {
    mergeReleaseEvidence(merged, evidenceOptions.release)

    for (const item of [
      {
        evidenceKey: 'linuxDebWorkflowEvidence',
        name: 'linuxDebWorkflow',
        verifiedKey: 'linuxDebWorkflowVerified',
      },
      {
        evidenceKey: 'windowsNsisWorkflowEvidence',
        name: 'windowsNsisWorkflow',
        verifiedKey: 'windowsNsisWorkflowVerified',
      },
      {
        evidenceKey: 'aurInstallEvidence',
        name: 'aurInstall',
        verifiedKey: 'aurInstallVerified',
      },
      {
        evidenceKey: 'guiSmokeEvidence',
        name: 'guiSmoke',
        verifiedKey: 'guiSmokeVerified',
      },
    ]) {
      if (!evidenceOptions[item.verifiedKey])
        continue

      mergeVerifiedEvidenceItem(merged, evidenceOptions, item)
    }
  }

  return merged
}

export function validateExternalReadinessEvidenceRelease(release, metadata) {
  if (release === undefined)
    return

  const errors = []

  for (const item of [
    {
      current: metadata.pkgVersion,
      field: 'version',
      value: release.version,
    },
    {
      current: metadata.releaseAssetName,
      field: 'assetName',
      value: release.assetName,
    },
    {
      current: metadata.releaseRepo,
      field: 'releaseRepo',
      value: release.releaseRepo,
    },
    {
      current: metadata.expectedHash,
      field: 'sha256',
      value: release.sha256,
    },
    {
      current: metadata.sourceUrl,
      field: 'sourceUrl',
      value: release.sourceUrl,
    },
  ]) {
    if (item.value !== item.current) {
      errors.push(
        `external readiness evidence release.${item.field} ${item.value} does not match current ${item.current}`,
      )
    }
  }

  if (errors.length > 0)
    throw new Error(errors.join('\n'))
}

function parseExternalReadinessReleaseEvidence(release) {
  if (!isPlainObject(release))
    throw new Error('release must be an object')

  const parsed = {}

  for (const key of ['assetName', 'releaseRepo', 'sha256', 'sourceUrl', 'version']) {
    if (typeof release[key] !== 'string')
      throw new Error(`release.${key} must be a string`)

    parsed[key] = release[key].trim()

    if (!parsed[key])
      throw new Error(`release.${key} is required`)
  }

  return parsed
}

function parseJsonObject(content) {
  let parsed

  try {
    parsed = JSON.parse(content)
  }
  catch (error) {
    throw new Error(`invalid external readiness evidence JSON: ${error.message}`)
  }

  if (!isPlainObject(parsed))
    throw new Error('external readiness evidence must be a JSON object')

  return parsed
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasNonEmptyObjectValue(value) {
  if (!isPlainObject(value))
    return true

  return Object.values(value).some(item => String(item).trim().length > 0)
}

function loadExternalReadinessEvidenceOptions(evidencePaths, cwd) {
  return mergeExternalReadinessEvidenceOptions(
    evidencePaths.map(evidencePath =>
      parseExternalReadinessEvidence(readFileSync(resolve(cwd, evidencePath), 'utf8')),
    ),
  )
}

function mergeExternalReadinessOptions(evidenceOptions, options) {
  return {
    aurInstallEvidence: options.aurInstallEvidence ?? evidenceOptions.aurInstallEvidence,
    aurInstallVerified: Boolean(evidenceOptions.aurInstallVerified || options.aurInstallVerified),
    guiSmokeEvidence: options.guiSmokeEvidence ?? evidenceOptions.guiSmokeEvidence,
    guiSmokeVerified: Boolean(evidenceOptions.guiSmokeVerified || options.guiSmokeVerified),
    linuxDebWorkflowEvidence: options.linuxDebWorkflowEvidence ?? evidenceOptions.linuxDebWorkflowEvidence,
    linuxDebWorkflowVerified: Boolean(evidenceOptions.linuxDebWorkflowVerified || options.linuxDebWorkflowVerified),
    windowsNsisWorkflowEvidence: options.windowsNsisWorkflowEvidence ?? evidenceOptions.windowsNsisWorkflowEvidence,
    windowsNsisWorkflowVerified: Boolean(evidenceOptions.windowsNsisWorkflowVerified || options.windowsNsisWorkflowVerified),
  }
}

function probeGithubCli() {
  const authStatus = spawnSync('gh', ['auth', 'status'], {
    encoding: 'utf8',
  })

  if (authStatus.error?.code === 'ENOENT') {
    return {
      authenticated: false,
      installed: false,
    }
  }

  return {
    authenticated: authStatus.status === 0,
    installed: true,
  }
}

export async function probeGithubRelease(metadata, fetchRelease = fetchGithubRelease) {
  const tag = `v${metadata.pkgVersion}`

  try {
    await fetchRelease(metadata.releaseRepo, tag)

    return {
      ok: true,
      releaseRepo: metadata.releaseRepo,
      tag,
    }
  }
  catch (error) {
    return {
      error: error.message,
      ok: false,
      releaseRepo: metadata.releaseRepo,
      tag,
    }
  }
}

export async function fetchGithubRelease(
  releaseRepo,
  tag,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10000,
) {
  const [owner, repo] = releaseRepo.split('/')

  if (!owner || !repo)
    throw new Error(`invalid GitHub release repo: ${releaseRepo}`)

  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort(new Error(`GitHub Release lookup timed out after ${timeoutMs}ms`))
  }, timeoutMs)

  try {
    const response = await fetchImpl(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/tags/${encodeURIComponent(tag)}`,
      {
        headers: {
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'lexora-buddy-release-check',
        },
        signal: controller.signal,
      },
    )

    if (!response.ok)
      throw new Error(`HTTP ${response.status}`)
  }
  catch (error) {
    if (controller.signal.aborted) {
      throw controller.signal.reason instanceof Error
        ? controller.signal.reason
        : new Error(`GitHub Release lookup timed out after ${timeoutMs}ms`)
    }

    throw error
  }
  finally {
    clearTimeout(timeout)
  }
}

async function probeRemoteDebAsset(metadata, downloadAsset = downloadHttpsAsset) {
  try {
    await verifyLexoraBuddyRemoteAsset(metadata, downloadAsset)

    return {
      ok: true,
      url: metadata.sourceUrl,
    }
  }
  catch (error) {
    return {
      error: error.message,
      ok: false,
      url: metadata.sourceUrl,
    }
  }
}

function commandExists(command) {
  return spawnSync('which', [command], { encoding: 'utf8' }).status === 0
}

export function readCliOptions(argv) {
  const evidencePaths = readCliOptionValues(argv, '--evidence')

  return {
    allowIncomplete: argv.includes('--allow-incomplete'),
    aurInstallVerified: argv.includes('--aur-install-verified'),
    ...(evidencePaths.length > 0 ? { evidencePaths } : {}),
    guiSmokeVerified: argv.includes('--gui-smoke-verified'),
    json: argv.includes('--json'),
    linuxDebWorkflowVerified: argv.includes('--linux-deb-workflow-verified'),
    printEvidenceTemplate: argv.includes('--print-evidence-template'),
    windowsNsisWorkflowVerified: argv.includes('--windows-nsis-workflow-verified'),
  }
}

function readCliOptionValues(argv, name) {
  const values = []

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== name)
      continue

    const value = argv[index + 1]

    if (!value || value.startsWith('--'))
      throw new Error(`${name} requires a value`)

    values.push(value)
  }

  return values
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBuddyExternalReadinessCli(process.argv.slice(2)).then((exitCode) => {
    if (exitCode !== 0)
      process.exit(exitCode)
  })
}

export async function runBuddyExternalReadinessCli(argv, io = {}) {
  const runCheck = io.runCheck ?? runBuddyExternalReadinessCheck
  const createEvidenceTemplate = io.createEvidenceTemplate
    ?? (() => createExternalReadinessEvidenceTemplateFromWorkspace())
  const writeError = io.writeError ?? writeCliError
  const writeOutput = io.writeOutput ?? writeCliOutput

  try {
    const options = readCliOptions(argv)

    if (options.printEvidenceTemplate) {
      writeOutput(JSON.stringify(createEvidenceTemplate(options), null, 2))
      return 0
    }

    await runCheck(options)
    return 0
  }
  catch (error) {
    writeError(error.message)
    return 1
  }
}

function readLexoraBuddyReleaseMetadata(cwd) {
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

  return metadata
}

function mergeReleaseEvidence(merged, release) {
  if (release === undefined)
    return

  if (merged.release === undefined) {
    merged.release = release
    return
  }

  for (const key of ['assetName', 'releaseRepo', 'sha256', 'sourceUrl', 'version']) {
    if (merged.release[key] !== release[key])
      throw new Error(`conflicting external readiness release metadata for ${key}`)
  }
}

function mergeVerifiedEvidenceItem(merged, evidenceOptions, item) {
  if (merged[item.verifiedKey] && merged[item.evidenceKey] !== evidenceOptions[item.evidenceKey])
    throw new Error(`conflicting external readiness evidence for ${item.name}`)

  merged[item.verifiedKey] = true
  merged[item.evidenceKey] = evidenceOptions[item.evidenceKey]
}
