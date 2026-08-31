import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { writeError, writeOutput } from '../shared/cli-output.mjs'
import { readLexoraVersionState, validateLexoraVersionState } from './version.mjs'

const repoRoot = resolve(import.meta.dirname, '../..')

export function formatLexoraReleaseStatus(state) {
  return [
    `Lexora ${state.productVersion} 发布状态`,
    `Buddy    ${state.applicationVersions.buddy}  可构建、可发布`,
    `Web      ${state.applicationVersions.web}  仅版本管理，发布流程尚未启用`,
    `API      ${state.applicationVersions.api}  仅版本管理，发布流程尚未启用`,
    `Agent    ${state.applicationVersions.agent}  仅版本管理，发布流程尚未启用`,
    'Website  —      独立部署，不参与产品版本',
  ].join('\n')
}

function main() {
  const state = readLexoraVersionState(repoRoot)
  const errors = validateLexoraVersionState(state)
  if (errors.length)
    throw new Error(errors.join('\n'))
  writeOutput(formatLexoraReleaseStatus(state))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  }
  catch (error) {
    writeError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
