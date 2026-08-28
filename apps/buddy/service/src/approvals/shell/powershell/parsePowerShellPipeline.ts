export function parsePowerShellPipeline(command: string): string[][] | null {
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
      if (character === '\'' && command[index + 1] === '\'') {
        currentWord += '\''
        index += 1
      }
      else if (character === '\'') {
        quote = null
      }
      else {
        currentWord += character
      }
      continue
    }
    if (quote === 'double') {
      if (character === '"') {
        quote = null
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
    if (character === ' ' || character === '\t' || character === '\r') {
      flushWord()
      continue
    }
    if (character === '|') {
      if (command[index + 1] === '|' || !flushCommand())
        return null
      continue
    }
    if (character === '\n' || ';>&<(){}[],@$`#'.includes(character))
      return null
    currentWord += character
    wordStarted = true
  }

  if (quote || !flushCommand())
    return null
  if (commands.some(words => words.includes('--%')))
    return null
  return commands
}
