import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const repoRoot = resolve(import.meta.dirname, '../..')
const globalBuddyInputs = new Set([
  '.node-version',
  'infrastructure/scripts/resolve-ci-scope.mjs',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
])
const buddyPrefixes = [
  '.github/workflows/',
  'apps/buddy/',
  'packages/assets/',
  'packaging/',
  'patches/',
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
  let docs = false
  let quality = false

  for (const input of files) {
    const path = normalizePath(input)

    if (path.startsWith('apps/docs/')) {
      docs = true
      continue
    }

    if (globalBuddyInputs.has(path) || buddyPrefixes.some(prefix => path.startsWith(prefix))) {
      buddy = true
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

  return { buddy, docs, quality }
}

export function listChangedFiles(base, head, mode, cwd = repoRoot) {
  const separator = mode === 'pull-request' ? '...' : '..'
  if (mode !== 'pull-request' && mode !== 'push')
    throw new Error(`Unsupported CI comparison mode: ${mode}`)

  const output = execFileSync('git', [
    'diff',
    '--name-only',
    '--no-renames',
    '--diff-filter=ACMRD',
    `${base}${separator}${head}`,
  ], {
    cwd,
    encoding: 'utf8',
  })

  return output.split('\n').filter(Boolean)
}

function fullScope() {
  return {
    buddy: true,
    docs: false,
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

  for (const name of ['base', 'head', 'mode']) {
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
  const files = options.files ?? listChangedFiles(
    options.base,
    options.head,
    options.mode,
  )
  writeScope(classifyCiScope(files), options['github-output'])
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname)
  run()
