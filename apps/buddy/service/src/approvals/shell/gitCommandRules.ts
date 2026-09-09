import type { ShellCommandClassification } from './shellCommandClassification'
import { requireShellApproval } from './shellCommandClassification'

const statusOptions = new Set([
  '-s',
  '--short',
  '-b',
  '--branch',
  '-sb',
  '-bs',
  '--show-stash',
  '--porcelain',
  '--long',
  '-z',
  '--null',
  '-uno',
  '-unormal',
  '-uall',
  '--untracked-files=no',
  '--untracked-files=normal',
  '--untracked-files=all',
  '--porcelain=v1',
  '--porcelain=v2',
  '--porcelain=1',
  '--porcelain=2',
  '--ignored',
  '--ignored=traditional',
  '--ignored=matching',
  '--ignored=no',
  '--ignore-submodules',
  '--ignore-submodules=all',
  '--ignore-submodules=dirty',
  '--ignore-submodules=untracked',
  '--ignore-submodules=none',
  '--no-renames',
  '--renames',
  '--ahead-behind',
  '--no-ahead-behind',
])
const diffSummaryOptions = new Set([
  '--check',
  '--stat',
  '--numstat',
  '--shortstat',
  '--name-only',
  '--name-status',
  '--summary',
  '--compact-summary',
  '--quiet',
  '-s',
  '--no-patch',
])
const diffOptions = new Set([
  ...diffSummaryOptions,
  '--cached',
  '--staged',
  '--exit-code',
  '--no-ext-diff',
  '--no-textconv',
  '--no-color',
  '--color=never',
  '--no-renames',
  '--relative',
  '--ignore-space-at-eol',
  '--ignore-cr-at-eol',
  '--ignore-blank-lines',
  '-w',
  '--ignore-all-space',
  '-b',
  '--ignore-space-change',
  '-z',
  '--raw',
  '-p',
  '--patch',
  '-u',
  '--binary',
])
const fileListOptions = new Set([
  '-c',
  '--cached',
  '-d',
  '--deleted',
  '-m',
  '--modified',
  '-o',
  '--others',
  '-i',
  '--ignored',
  '-s',
  '--stage',
  '-u',
  '--unmerged',
  '-k',
  '--killed',
  '-t',
  '-v',
  '-f',
  '-z',
  '--exclude-standard',
  '--error-unmatch',
  '--full-name',
  '--deduplicate',
  '--eol',
])
const checkIgnoreOptions = new Set([
  '-q',
  '--quiet',
  '-v',
  '--verbose',
  '-n',
  '--non-matching',
  '--no-index',
])
const logOptions = new Set([
  '--oneline',
  '--graph',
  '--decorate',
  '--no-decorate',
  '--all',
  '--branches',
  '--tags',
  '--remotes',
  '--first-parent',
  '--no-merges',
  '--merges',
  '--reverse',
  '--date-order',
  '--topo-order',
  '--no-color',
  '--color=never',
  '-s',
  '--no-patch',
  '--abbrev-commit',
  '--no-abbrev-commit',
])

export function classifyGitCommand(arguments_: readonly string[]): ShellCommandClassification {
  let index = 0
  while (['--no-pager', '--no-optional-locks', '--literal-pathspecs'].includes(arguments_[index] ?? ''))
    index += 1
  const operation = arguments_[index++]
  const options = operation === 'status'
    ? statusOptions
    : operation === 'diff'
      ? diffOptions
      : operation === 'ls-files'
        ? fileListOptions
        : operation === 'check-ignore'
          ? checkIgnoreOptions
          : operation === 'log'
            ? logOptions
            : null
  if (!options)
    return requireShellApproval('unsafe-arguments')

  const paths: string[] = []
  const diffArguments: string[] = []
  let pathMode = operation === 'ls-files' || operation === 'check-ignore'
  let literalPaths = false
  for (; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!
    if (!literalPaths && argument === '--') {
      pathMode = true
      literalPaths = true
      diffArguments.push('--')
      continue
    }
    if (!literalPaths && argument.startsWith('-')) {
      if (!options.has(argument)
        && !(operation === 'log' && /^(?:-\d+|--max-count=\d+|--decorate=(?:short|full|no))$/.test(argument))
        && !(operation === 'diff' && /^-U\d+$/.test(argument))) {
        return requireShellApproval('unsafe-arguments')
      }
      if (argument === '--cached' || argument === '--staged')
        diffArguments.push(argument)
      continue
    }
    if (pathMode || operation === 'status') {
      if (!isLiteralRelativePath(argument))
        return requireShellApproval('unsafe-arguments')
      paths.push(argument)
    }
    else if (!/^\w[\w./@~^+-]*$/.test(argument)) {
      return requireShellApproval('unsafe-arguments')
    }
    diffArguments.push(argument)
  }

  return {
    git: true,
    ...(operation === 'diff' ? { gitDiffs: [diffArguments] } : {}),
    readPaths: ['.', ...paths],
    type: 'auto-approve',
  }
}

export function isLiteralRelativePath(value: string): boolean {
  return value.length > 0
    && !value.startsWith('-')
    && !value.startsWith('/')
    && !value.startsWith('~')
    && !/[\\:*?[\]{}]/.test(value)
    && [...value].every(character => character.charCodeAt(0) >= 32)
    && !value.split('/').includes('..')
}
