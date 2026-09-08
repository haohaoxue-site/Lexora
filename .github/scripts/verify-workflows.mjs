import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { desktopPackageTargets } from '../../packaging/buddy/release/verify-release-artifacts.mjs'
import { writeOutput } from '../../packaging/shared/cli-output.mjs'

const repoRoot = resolve(import.meta.dirname, '../..')
const names = ['ci', 'buddy-build', 'prepare-release', 'release']
const buildCommand = /\bpnpm\s[^\n]*(?:\bbuild(?::[\w-]+)?\b|\bpackage:[\w-]+\b)/

export function verifyWorkflows(cwd = repoRoot) {
  const workflows = Object.fromEntries(names.map(name => [
    name,
    parse(readFileSync(resolve(cwd, `.github/workflows/${name}.yml`), 'utf8')),
  ]))
  const errors = []
  const require = (condition, message) => {
    if (!condition)
      errors.push(message)
  }
  for (const [name, workflow] of Object.entries(workflows)) {
    require(workflow.permissions?.contents === 'read'
      && Object.keys(workflow.permissions).length === 1, `${name} must default to contents: read`)
    for (const [id, job] of Object.entries(workflow.jobs)) {
      for (const dependency of asArray(job.needs))
        require(Boolean(workflow.jobs[dependency]), `${name}/${id} needs unknown job ${dependency}`)
      const mayWrite = (name === 'release' && id === 'publish-release')
        || (name === 'prepare-release' && id === 'prepare-release')
      if (!mayWrite)
        require(typeof job.permissions !== 'string' && Object.values(job.permissions ?? {}).every(value => value !== 'write'), `${name}/${id} must not obtain write permissions`)
      for (const action of [job, ...job.steps ?? []]) {
        if (action.uses && !action.uses.startsWith('./'))
          require(/@[a-f\d]{40}$/.test(action.uses), `${name}/${id} action must use a commit SHA`)
      }
    }
  }

  const ci = workflows.ci
  require(Object.keys(ci.on).join() === 'pull_request', 'PR CI must only run on pull_request')
  for (const [id, job] of Object.entries(ci.jobs)) {
    require(!job.uses?.endsWith('buddy-build.yml'), 'PR CI must not call platform packaging')
    require(!buildCommand.test(commands(job)), `PR job ${id} must not build products or packages`)
  }
  const gate = ci.jobs['ci-gate']
  require(gate?.name === 'CI Gate' && gate.if === 'always()', 'PR CI must expose the stable always-running CI Gate')
  require(Object.keys(ci.jobs).filter(id => id !== 'ci-gate').every(id => asArray(gate?.needs).includes(id)), 'CI Gate must depend on every PR check')

  const build = workflows['buddy-build']
  require(Object.keys(build.on).join() === 'workflow_call', 'Package workflow must only run through a caller')
  for (const [target, definition] of Object.entries(desktopPackageTargets)) {
    const job = build.jobs[`build-${definition.directory === 'desktop' ? 'ubuntu' : definition.directory}`]
    const steps = job?.steps ?? []
    const packageStep = steps.findIndex(step => step.run?.includes(`package:${target === 'pacman' ? 'arch' : target === 'nsis' ? 'windows' : target}`))
    const installStep = steps.findIndex(step => step.id === 'install')
    const smokeStep = steps.findIndex(step => step.id === 'smoke')
    const uploadStep = steps.findIndex(step => step.uses?.startsWith('actions/upload-artifact@'))
    require(packageStep >= 0 && packageStep < installStep && installStep < smokeStep && smokeStep < uploadStep, `${target} must build, install, smoke and only then upload`)
    require(steps[uploadStep]?.with?.name === definition.artifact, `${target} artifact identity must match release metadata`)
    require(steps[uploadStep]?.with?.['if-no-files-found'] === 'error', `${target} must reject missing artifacts`)
  }

  const release = workflows.release
  require(asArray(release.on?.push?.branches).includes('master'), 'Release must use the version transition on master')
  require(asArray(release.on?.push?.paths).includes('apps/buddy/buddy.version.json'), 'Release must be limited to Buddy version transitions')
  require(asArray(release.jobs['buddy-packages']?.needs).includes('validate-release'), 'Builds must follow release identity validation')
  const publish = release.jobs['publish-release']
  require(asArray(publish?.needs).includes('buddy-packages') && asArray(publish?.needs).includes('validate-release'), 'Publication must wait for the validated transition and all packages')
  require(publish?.permissions?.contents === 'write' && !buildCommand.test(commands(publish)), 'Publication may upload but must not rebuild packages')
  require(!commands(publish).includes('--clobber'), 'Publication must not overwrite release assets')
  const publicCheck = release.jobs['verify-public-assets']
  require(asArray(publicCheck?.needs).includes('publish-release'), 'Public asset verification must run after publication')
  for (const job of [publish, publicCheck]) {
    const downloads = (job?.steps ?? []).filter(step => step.uses?.startsWith('actions/download-artifact@'))
    for (const definition of Object.values(desktopPackageTargets))
      require(downloads.some(step => step.with?.name === definition.artifact), `Release must consume ${definition.artifact}`)
  }
  return errors
}

function asArray(value) {
  return value === undefined ? [] : Array.isArray(value) ? value : [value]
}

function commands(job) {
  return (job?.steps ?? []).map(step => step.run ?? '').join('\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = verifyWorkflows()
  if (errors.length)
    throw new Error(errors.join('\n'))
  writeOutput('Release workflow contracts passed')
}
