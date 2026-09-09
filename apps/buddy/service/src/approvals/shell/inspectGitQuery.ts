import type { ShellApprovalReason } from '../../../../shared/permissions/approvalReviewPayload'
import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

const executeFile = promisify(execFile)

type GitInspection = { reason: ShellApprovalReason } | { paths: readonly string[] }

export async function inspectGitQuery(cwd: string, diffs: readonly (readonly string[])[]): Promise<GitInspection> {
  if (process.env.GIT_EXTERNAL_DIFF)
    return { reason: 'git-external-program' }
  if (['GIT_CONFIG', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES'].some(key => process.env[key]))
    return { reason: 'git-config-unavailable' }
  try {
    const stdout = await queryGit(cwd, ['config', '--null', '--list', '--includes'])
    for (const entry of stdout.split('\0')) {
      const separator = entry.indexOf('\n')
      const key = (separator < 0 ? entry : entry.slice(0, separator)).toLowerCase()
      const value = separator < 0 ? '' : entry.slice(separator + 1)
      if ((key === 'core.fsmonitor' && !/^(?:true|false|yes|no|on|off|0|1)?$/i.test(value))
        || key === 'diff.external'
        || /^diff\..+\.(?:command|textconv)$/.test(key)
        || /^filter\..+\.(?:clean|smudge|process)$/.test(key)
        || (key === 'log.showsignature' && !/^(?:false|no|off|0)$/i.test(value))) {
        return { reason: 'git-external-program' }
      }
      if (key === 'extensions.partialclone'
        || (/^remote\..+\.promisor$/.test(key) && !/^(?:false|no|off|0)$/i.test(value))) {
        return { reason: 'git-config-unavailable' }
      }
    }
    const root = (await queryGit(cwd, ['rev-parse', '--show-toplevel'])).replace(/\r?\n$/, '')
    if (!isAbsolute(root))
      return { reason: 'git-config-unavailable' }
    const hook = (await queryGit(root, ['rev-parse', '--path-format=absolute', '--git-path', 'hooks/post-index-change'])).replace(/\r?\n$/, '')
    try {
      await stat(hook)
      return { reason: 'git-external-program' }
    }
    catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? ''))
        throw error
    }
    const modes = await queryGit(root, ['ls-files', '--format=%(objectmode)'])
    if (modes.split(/\r?\n/).includes('160000'))
      return { reason: 'git-config-unavailable' }
    if (diffs.length === 0)
      return { paths: [] }
    const paths = new Set<string>()
    for (const serialized of new Set(diffs.map(arguments_ => JSON.stringify(arguments_)))) {
      const arguments_: string[] = JSON.parse(serialized)
      for (const argument of arguments_) {
        if (argument === '--')
          break
        if (argument.startsWith('-'))
          continue
        for (const revision of argument.split(/\.{2,3}/))
          await queryGit(cwd, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${revision || 'HEAD'}^{commit}`])
      }
      const names = await queryGit(cwd, [
        'diff',
        '--name-only',
        '-z',
        '--no-ext-diff',
        '--no-textconv',
        '--no-renames',
        '--no-relative',
        ...arguments_,
      ])
      for (const name of names.split('\0').filter(Boolean)) {
        if (isAbsolute(name) || name.split(/[\\/]/).includes('..'))
          return { reason: 'git-config-unavailable' }
        paths.add(resolve(root, name))
      }
    }
    return { paths: [...paths] }
  }
  catch {
    return { reason: 'git-config-unavailable' }
  }
}

async function queryGit(cwd: string, arguments_: readonly string[]): Promise<string> {
  const { stdout } = await executeFile('git', ['--no-pager', '--no-optional-locks', '-c', 'core.fsmonitor=false', ...arguments_], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_NO_LAZY_FETCH: '1' },
    maxBuffer: 256 * 1024,
    timeout: 3_000,
    windowsHide: true,
  })
  return stdout
}
