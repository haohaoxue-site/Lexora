export function parseBashCommandList(command: string): string[][] | null {
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
