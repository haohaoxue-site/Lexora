import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { writeError as writeCliError, writeOutput as writeCliOutput } from '../../shared/cli-output.mjs'
import {
  createExternalReadinessEvidenceTemplate,
  createExternalReadinessEvidenceTemplateFromWorkspace,
} from '../release/verify-external-readiness.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

const evidenceKindToTemplateKey = {
  'aur-install': 'aurInstall',
  'gui-smoke': 'guiSmoke',
  'linux-deb-workflow': 'linuxDebWorkflow',
  'windows-nsis-workflow': 'windowsNsisWorkflow',
}

export function createExternalReadinessEvidence(input) {
  const itemKey = evidenceKindToTemplateKey[input.kind]

  if (!itemKey)
    throw new Error(`unsupported external readiness evidence kind: ${input.kind}`)

  const evidence = typeof input.evidence === 'string' ? input.evidence.trim() : ''

  if (!evidence)
    throw new Error('external readiness evidence text is required')

  return {
    ...createExternalReadinessEvidenceTemplate(input.metadata),
    [itemKey]: {
      evidence,
      verified: true,
    },
  }
}

export function readEvidenceWriterOptions(argv, env = process.env) {
  return {
    evidence: readCliOptionValue(argv, '--evidence') ?? env.LEXORA_BUDDY_EVIDENCE_TEXT,
    kind: readCliOptionValue(argv, '--kind') ?? env.LEXORA_BUDDY_EVIDENCE_KIND,
    outputPath: readCliOptionValue(argv, '--output') ?? env.LEXORA_BUDDY_EVIDENCE_OUTPUT,
  }
}

export function createExternalReadinessEvidenceFromWorkspace(options) {
  const template = createExternalReadinessEvidenceTemplateFromWorkspace(options.cwd ?? repoRoot)

  return createExternalReadinessEvidenceFromTemplate({
    evidence: options.evidence,
    kind: options.kind,
    template,
  })
}

export async function runExternalReadinessEvidenceWriter(argv, io = {}) {
  const cwd = io.cwd ?? repoRoot
  const env = io.env ?? process.env
  const writeError = io.writeError ?? writeCliError
  const writeOutput = io.writeOutput ?? writeCliOutput

  try {
    const options = readEvidenceWriterOptions(argv, env)
    const evidence = createExternalReadinessEvidenceFromWorkspace({
      cwd,
      evidence: requireOption(options.evidence, 'external readiness evidence text is required'),
      kind: requireOption(options.kind, 'external readiness evidence kind is required'),
    })
    const output = `${JSON.stringify(evidence, null, 2)}\n`

    if (options.outputPath) {
      const outputPath = resolve(cwd, options.outputPath)
      mkdirSync(dirname(outputPath), { recursive: true })
      writeFileSync(outputPath, output)
    }
    else {
      writeOutput(output.trimEnd())
    }

    return 0
  }
  catch (error) {
    writeError(error.message)
    return 1
  }
}

function createExternalReadinessEvidenceFromTemplate(input) {
  const itemKey = evidenceKindToTemplateKey[input.kind]

  if (!itemKey)
    throw new Error(`unsupported external readiness evidence kind: ${input.kind}`)

  const evidence = typeof input.evidence === 'string' ? input.evidence.trim() : ''

  if (!evidence)
    throw new Error('external readiness evidence text is required')

  return {
    ...input.template,
    [itemKey]: {
      evidence,
      verified: true,
    },
  }
}

function requireOption(value, message) {
  if (typeof value === 'string' && value.trim())
    return value

  throw new Error(message)
}

function readCliOptionValue(argv, name) {
  const index = argv.indexOf(name)

  if (index === -1)
    return undefined

  const value = argv[index + 1]

  if (!value || value.startsWith('--'))
    throw new Error(`${name} requires a value`)

  return value
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runExternalReadinessEvidenceWriter(process.argv.slice(2)).then((exitCode) => {
    if (exitCode !== 0)
      process.exit(exitCode)
  })
}
