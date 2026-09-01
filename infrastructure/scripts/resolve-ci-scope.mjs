import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const repoRoot = resolve(import.meta.dirname, '../..')
const globalBuddyInputs = new Set([
  '.node-version',
  'pnpm-workspace.yaml',
])
const buddyWorkflowInputs = new Set([
  '.github/workflows/buddy-build.yml',
])
const contractInputs = new Set([
  '.github/workflows/ci.yml',
  '.github/workflows/prepare-release.yml',
  '.github/workflows/release.yml',
  'infrastructure/scripts/resolve-ci-scope.mjs',
  'packaging/buddy/release/verify-release-workflow.mjs',
  'packaging/release/status.mjs',
  'packaging/release/transition.mjs',
  'packaging/release/version.mjs',
  'packaging/shared/cli-output.mjs',
])
const websiteInputs = new Set([
  '.github/workflows/website-pages.yml',
  'packaging/website/release/verify-pages-workflow.mjs',
])
const ignoredInputs = new Set([
  'README.en.md',
  'README.md',
  'apps/buddy/README.md',
  'packaging/buddy/README.md',
])
const websitePrefixes = [
  'apps/docs/',
  'apps/website/',
]
const buddyPrefixes = [
  'apps/buddy/',
  'packages/assets/',
  'packaging/buddy/',
  'patches/',
]
const conservativeContractPrefixes = [
  '.github/workflows/',
  'packaging/release/',
  'packaging/shared/',
  'packaging/website/',
]
const qualityPrefixes = [
  '.github/',
  'apps/agent/',
  'apps/api/',
  'apps/web/',
  'evals/',
  'infrastructure/',
  'packages/contracts/',
  'packages/shared/',
  'packages/surfaces/',
]

export function classifyCiScope(files) {
  if (files.length === 0)
    return fullScope()

  let buddy = false
  let contracts = false
  let website = false
  let quality = false

  for (const input of files) {
    const path = normalizePath(input)

    if (ignoredInputs.has(path))
      continue

    if (websiteInputs.has(path) || websitePrefixes.some(prefix => path.startsWith(prefix))) {
      website = true
      continue
    }

    if (path === 'pnpm-lock.yaml') {
      buddy = true
      quality = true
      continue
    }

    if (path === 'package.json') {
      buddy = true
      contracts = true
      quality = true
      continue
    }

    if (buddyWorkflowInputs.has(path)) {
      buddy = true
      contracts = true
      quality = true
      continue
    }

    if (contractInputs.has(path)) {
      contracts = true
      continue
    }

    if (globalBuddyInputs.has(path) || buddyPrefixes.some(prefix => path.startsWith(prefix))) {
      buddy = true
      quality = true
      continue
    }

    if (conservativeContractPrefixes.some(prefix => path.startsWith(prefix))) {
      buddy = true
      contracts = true
      quality = true
      continue
    }

    if (qualityPrefixes.some(prefix => path.startsWith(prefix))) {
      quality = true
      continue
    }

    buddy = true
    quality = true
  }

  return { buddy, contracts, website, quality }
}

export function listChangedFiles(base, head, cwd = repoRoot) {
  const output = execFileSync('git', [
    'diff',
    '--name-only',
    '--no-renames',
    '--diff-filter=ACMRD',
    `${base}...${head}`,
  ], {
    cwd,
    encoding: 'utf8',
  })

  return output.split('\n').filter(Boolean)
}

export function resolveCiScope(base, head, cwd = repoRoot) {
  return classifyCiScope(listChangedFiles(base, head, cwd))
}

function fullScope() {
  return {
    buddy: true,
    contracts: true,
    website: false,
    quality: true,
  }
}

function normalizePath(path) {
  return path.replaceAll('\\', '/').replace(/^\.\//, '')
}

function parseOptions(args) {
  if (args[0] === '--files')
    return { files: args.slice(1) }

  const options = {}
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]
    const value = args[index + 1]
    if (!name?.startsWith('--') || value === undefined)
      throw new Error(`Invalid CI scope option: ${name ?? ''}`)
    options[name.slice(2)] = value
  }

  for (const name of ['base', 'head']) {
    if (!options[name])
      throw new Error(`Missing required CI scope option: --${name}`)
  }

  return options
}

function writeScope(scope, githubOutput) {
  if (githubOutput) {
    appendFileSync(
      githubOutput,
      `${Object.entries(scope).map(([name, value]) => `${name}=${value}`).join('\n')}\n`,
    )
  }

  process.stdout.write(`${JSON.stringify(scope)}\n`)
}

function run() {
  const options = parseOptions(process.argv.slice(2))
  const scope = options.files
    ? classifyCiScope(options.files)
    : resolveCiScope(options.base, options.head)
  writeScope(scope, options['github-output'])
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname)
  run()
