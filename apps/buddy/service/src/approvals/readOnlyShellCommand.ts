type CommandValidator = (arguments_: readonly string[]) => boolean

const allowedEnvironment = new Map<string, RegExp>([
  ['COLUMNS', /^\d{1,4}$/],
  ['LANG', /^(?:C|POSIX)$/],
  ['LC_ALL', /^(?:C|POSIX)$/],
  ['LINES', /^\d{1,4}$/],
  ['TZ', /^(?:UTC|Etc\/UTC)$/],
])

const commandValidators = new Map<string, CommandValidator>([
  ['awk', validateAwk],
  ['df', validateDf],
  ['echo', allowLiteralArguments],
  ['free', allowLiteralArguments],
  ['grep', validateGrep],
  ['head', validateHead],
  ['hostname', validateHostname],
  ['id', allowLiteralArguments],
  ['iostat', allowLiteralArguments],
  ['ls', validateLs],
  ['lsblk', allowLiteralArguments],
  ['lscpu', allowLiteralArguments],
  ['lsmem', allowLiteralArguments],
  ['mpstat', allowLiteralArguments],
  ['nproc', allowLiteralArguments],
  ['pgrep', validatePgrep],
  ['pidof', allowLiteralArguments],
  ['printf', validatePrintf],
  ['ps', allowLiteralArguments],
  ['pwd', allowLiteralArguments],
  ['rg', validateRg],
  ['sensors', validateSensors],
  ['sort', validateSort],
  ['ss', validateSs],
  ['systemctl', validateSystemctl],
  ['tail', validateTail],
  ['top', validateTop],
  ['tr', validateTr],
  ['uname', allowLiteralArguments],
  ['uniq', validateOptionsOnly],
  ['uptime', allowLiteralArguments],
  ['vmstat', allowLiteralArguments],
  ['wc', validateWc],
  ['which', validateCommandNames],
  ['xmllint', validateXmllint],
])

const readOnlySystemctlOperations = new Set([
  'is-active',
  'is-enabled',
  'is-failed',
  'list-dependencies',
  'list-unit-files',
  'list-units',
  'show',
  'status',
])

const readOnlyXmllintOptions = new Set([
  '--nocatalogs',
  '--nonet',
  '--noout',
  '--nowarning',
  '--quiet',
  '--strict-namespace',
])

export function isReadOnlyShellCommand(command: string): boolean {
  const commands = tokenizeCommandList(command)
  return commands !== null
    && commands.length > 0
    && commands.every(validateSimpleCommand)
}

function tokenizeCommandList(command: string): string[][] | null {
  const commands: string[][] = []
  let currentCommand: string[] = []
  let currentWord = ''
  let quote: 'double' | 'single' | null = null
  let wordStarted = false

  const flushWord = () => {
    if (!wordStarted)
      return
    currentCommand.push(currentWord)
    currentWord = ''
    wordStarted = false
  }
  const flushCommand = (): boolean => {
    flushWord()
    if (currentCommand.length === 0)
      return false
    commands.push(currentCommand)
    currentCommand = []
    return true
  }

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]!
    if (quote === 'single') {
      if (character === '\'')
        quote = null
      else
        currentWord += character
      continue
    }
    if (quote === 'double') {
      if (character === '"') {
        quote = null
        continue
      }
      if (character === '\\') {
        const next = command[index + 1]
        if (next === undefined)
          return null
        currentWord += next
        index += 1
        continue
      }
      if (character === '$' || character === '`')
        return null
      currentWord += character
      continue
    }
    if (character === '\'' || character === '"') {
      quote = character === '\'' ? 'single' : 'double'
      wordStarted = true
      continue
    }
    if (character === '\\') {
      const next = command[index + 1]
      if (next === undefined)
        return null
      currentWord += next
      wordStarted = true
      index += 1
      continue
    }
    if (character === ' ' || character === '\t' || character === '\r') {
      flushWord()
      continue
    }
    if (character === '\n')
      return null
    if (character === '|' || character === '&') {
      const next = command[index + 1]
      if (character === '&' && next !== '&')
        return null
      if (character === '|' && next === '&')
        return null
      if (!flushCommand())
        return null
      if (next === character)
        index += 1
      continue
    }
    if (character === ';') {
      if (!flushCommand() || command[index + 1] === ';')
        return null
      continue
    }
    if ('<>(){}'.includes(character))
      return null
    if (character === '$' || character === '`')
      return null
    if ('*?['.includes(character) || character === ']')
      return null
    if (character === '#' && !wordStarted)
      return null
    if (character === '~' && !wordStarted)
      return null
    currentWord += character
    wordStarted = true
  }

  if (quote || !flushCommand())
    return null
  return commands
}

function validateSimpleCommand(words: readonly string[]): boolean {
  let commandIndex = 0
  while (commandIndex < words.length && isAllowedEnvironmentAssignment(words[commandIndex]!))
    commandIndex += 1
  const command = words[commandIndex]
  if (!command || !/^[\w.+-]+$/.test(command))
    return false
  const validator = commandValidators.get(command)
  return validator?.(words.slice(commandIndex + 1)) ?? false
}

function isAllowedEnvironmentAssignment(word: string): boolean {
  const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(word)
  if (!match)
    return false
  return allowedEnvironment.get(match[1]!)?.test(match[2]!) ?? false
}

function allowLiteralArguments(): boolean {
  return true
}

function validateDf(arguments_: readonly string[]): boolean {
  return !arguments_.includes('--sync')
}

function validateAwk(arguments_: readonly string[]): boolean {
  let index = 0
  while (index < arguments_.length) {
    const argument = arguments_[index]!
    if (argument === '--') {
      index += 1
      break
    }
    if (argument === '-F' || argument === '-v') {
      if (!arguments_[index + 1])
        return false
      index += 2
      continue
    }
    if (/^-F.+/.test(argument) || /^-v[A-Za-z_]\w*=/.test(argument)) {
      index += 1
      continue
    }
    if (argument === '--posix' || argument === '--traditional') {
      index += 1
      continue
    }
    break
  }
  const program = arguments_[index]
  if (!program || index !== arguments_.length - 1)
    return false
  return !/(?:^|\W)(?:ENVIRON|getline|system)(?:\W|$)|[<>|]|@\s*(?:include|load)\b/.test(program)
}

function validateGrep(arguments_: readonly string[]): boolean {
  if (arguments_.some(argument => /^(?:-[fRr]|--(?:directories|exclude-from|file|include|recursive))(?:$|=)/.test(argument)))
    return false
  return arguments_.filter(argument => !argument.startsWith('-')).length === 1
}

function validateHead(arguments_: readonly string[]): boolean {
  return validateStreamSlice(arguments_, false)
}

function validateTail(arguments_: readonly string[]): boolean {
  return validateStreamSlice(arguments_, true)
}

function validateStreamSlice(arguments_: readonly string[], tail: boolean): boolean {
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!
    if (/^-\d+$/.test(argument) || /^--(?:bytes|lines)=[+-]?\d+$/.test(argument))
      continue
    if (argument === '-c' || argument === '-n' || argument === '--bytes' || argument === '--lines') {
      if (!/^[+-]?\d+$/.test(arguments_[index + 1] ?? ''))
        return false
      index += 1
      continue
    }
    if (['-q', '-v', '--quiet', '--verbose', '--zero-terminated'].includes(argument))
      continue
    if (tail && /^(?:-f|--follow|--pid|--retry)(?:$|=)/.test(argument))
      return false
    return false
  }
  return true
}

function validateHostname(arguments_: readonly string[]): boolean {
  return arguments_.every(argument => new Set([
    '-d',
    '-f',
    '-i',
    '-I',
    '-s',
    '--domain',
    '--fqdn',
    '--ip-address',
    '--short',
  ]).has(argument))
}

function validateLs(arguments_: readonly string[]): boolean {
  return arguments_.every(argument => argument === '.' || argument.startsWith('-'))
}

function validatePrintf(arguments_: readonly string[]): boolean {
  return !arguments_.includes('-v')
}

function validatePgrep(arguments_: readonly string[]): boolean {
  return !arguments_.some(argument => (
    /^(?:--mrelease|--signal)(?:$|=)/.test(argument)
  ))
}

function validateRg(arguments_: readonly string[]): boolean {
  if (arguments_.some(argument => /^(?:--pre|--pre-glob)(?:$|=)/.test(argument)))
    return false
  if (arguments_.includes('--files'))
    return arguments_.every(argument => argument === '.' || argument.startsWith('-'))
  return validateGrep(arguments_)
}

function validateSort(arguments_: readonly string[]): boolean {
  return arguments_.every(argument => (
    argument.startsWith('-')
    && !/^(?:-o|-T|--(?:compress-program|files0-from|output|temporary-directory))/.test(argument)
  ))
}

function validateSensors(arguments_: readonly string[]): boolean {
  return !hasShortOption(arguments_, 's')
    && !arguments_.some(argument => /^--set(?:$|=)/.test(argument))
}

function validateSs(arguments_: readonly string[]): boolean {
  return !['D', 'E', 'K'].some(option => hasShortOption(arguments_, option))
    && !arguments_.some(argument => /^(?:--diag|--events|--kill)(?:$|=)/.test(argument))
}

function validateSystemctl(arguments_: readonly string[]): boolean {
  if (
    ['H', 'M'].some(option => hasShortOption(arguments_, option))
    || arguments_.some(argument => (
      /^(?:--host|--image|--machine|--root|--transport)(?:$|=)/.test(argument)
    ))
  ) {
    return false
  }
  const operation = arguments_.find(argument => !argument.startsWith('-'))
  return operation !== undefined && readOnlySystemctlOperations.has(operation)
}

function validateTop(arguments_: readonly string[]): boolean {
  const batch = hasShortOption(arguments_, 'b')
    || arguments_.includes('--batch-mode')
  const bounded = arguments_.some((argument, index) => (
    /^-[^-]*n\d+$/.test(argument)
    || /^--iterations=\d+$/.test(argument)
    || (
      /^-[^-]*n$/.test(argument)
      && /^\d+$/.test(arguments_[index + 1] ?? '')
    )
  ))
  return batch && bounded
}

function validateTr(arguments_: readonly string[]): boolean {
  const operands = arguments_.filter(argument => !argument.startsWith('-'))
  return operands.length >= 1 && operands.length <= 2
}

function validateWc(arguments_: readonly string[]): boolean {
  return arguments_.every(argument => (
    argument.startsWith('-') && !/^--files0-from(?:$|=)/.test(argument)
  ))
}

function validateXmllint(arguments_: readonly string[]): boolean {
  return arguments_.includes('--noout')
    && arguments_.some(isLocalRelativePath)
    && arguments_.every(argument => (
      readOnlyXmllintOptions.has(argument) || isLocalRelativePath(argument)
    ))
}

function isLocalRelativePath(value: string): boolean {
  return value.length > 0
    && !value.startsWith('-')
    && !value.startsWith('/')
    && !value.includes(':')
    && !value.split('/').includes('..')
}

function validateOptionsOnly(arguments_: readonly string[]): boolean {
  return arguments_.every(argument => argument.startsWith('-'))
}

function validateCommandNames(arguments_: readonly string[]): boolean {
  return arguments_.length > 0 && arguments_.every(argument => /^[\w.+-]+$/.test(argument))
}

function hasShortOption(arguments_: readonly string[], option: string): boolean {
  return arguments_.some(argument => (
    argument.startsWith('-')
    && !argument.startsWith('--')
    && argument.slice(1).includes(option)
  ))
}
