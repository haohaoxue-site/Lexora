import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

import { writeOutput } from '../../shared/cli-output.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')

export function verifyLinuxReleaseWorkflow(cwd = repoRoot) {
  const workflow = readFileSync(resolve(cwd, '.github/workflows/buddy-linux-deb.yml'), 'utf8')
  const publishMarker = '\n  publish-release:\n'
  const publishOffset = workflow.indexOf(publishMarker)
  const errors = []

  if (!/^permissions:\n {2}contents: read$/m.test(workflow))
    errors.push('Linux workflow must default to read-only repository contents')
  if (publishOffset < 0)
    errors.push('Linux workflow must isolate release publication in a dedicated job')

  const buildJob = publishOffset < 0 ? workflow : workflow.slice(0, publishOffset)
  const publishJob = publishOffset < 0 ? '' : workflow.slice(publishOffset)
  const installDebCommand = 'sudo apt-get install -y ./apps/buddy/.output/artifacts/desktop/Lexora-Buddy-*-linux-amd64.deb'
  const guiSmokeCommand = 'node packaging/buddy/ci/run-gui-smoke.mjs'
  const installOffset = buildJob.indexOf(installDebCommand)
  const guiSmokeOffset = buildJob.indexOf(guiSmokeCommand)
  if (/gh release (?:create|upload)/.test(buildJob))
    errors.push('Linux build job must not mutate GitHub Releases')
  if (installOffset < 0 || guiSmokeOffset < 0 || installOffset > guiSmokeOffset)
    errors.push('Linux build job must install the built Desktop deb before GUI smoke')
  if (
    !buildJob.includes('LEXORA_DESKTOP_EXECUTABLE_PATH: /opt/Lexora Buddy/lexora-buddy')
    || !buildJob.includes('LEXORA_BUDDY_PET_PATH: /opt/Lexora Buddy/resources/native-pet/lexora-buddy-pet')
    || guiSmokeOffset < 0
  ) {
    errors.push('Linux build job must run GUI smoke against the installed Desktop and native pet')
  }
  if (!publishJob.includes('needs: build-linux'))
    errors.push('Linux release publication must consume the verified build job')
  if (!/if:\s+\$\{\{\s*inputs\.upload_release_asset\s*&&\s*github\.ref\s*==\s*'refs\/heads\/master'\s*\}\}/.test(publishJob))
    errors.push('Linux release publication job must be gated to master before write permission is issued')
  if (!publishJob.includes('name: buddy-release'))
    errors.push('Linux release publication must use the buddy-release Environment')
  if (!/permissions:\n {6}contents: write/.test(publishJob))
    errors.push('Linux release publication job must own the only contents write permission')
  if (!publishJob.includes('actions/download-artifact@v4'))
    errors.push('Linux release publication must consume the verified workflow artifact')

  return errors
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const errors = verifyLinuxReleaseWorkflow()
  if (errors.length)
    throw new Error(errors.join('\n'))

  writeOutput('Linux release workflow permission boundary passed')
}
