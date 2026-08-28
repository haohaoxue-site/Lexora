import type { ShellCommandApprovalReason } from '../shellCommandClassification'

type ArgumentValidator = (arguments_: readonly string[]) => boolean
type ParameterValueValidator = false | ((value: string) => boolean)
type ParameterRules = Readonly<Record<string, ParameterValueValidator>>

const literal = (value: string) => value.length > 0 && !value.startsWith('-')
const integer = (value: string) => /^\d+$/.test(value)
const positiveInteger = (value: string) => /^[1-9]\d*$/.test(value)

const commandValidators = new Map<string, ArgumentValidator>([
  ['convertto-json', createParameterValidator({
    '-compress': false,
    '-depth': positiveInteger,
    '-enumsasstrings': false,
    '-escapehandling': literal,
  })],
  ['format-list', createParameterValidator({
    '-force': false,
    '-groupby': literal,
    '-property': literal,
    '-view': literal,
  })],
  ['format-table', createParameterValidator({
    '-autosize': false,
    '-force': false,
    '-groupby': literal,
    '-hidetableheaders': false,
    '-property': literal,
    '-view': literal,
    '-wrap': false,
  })],
  ['get-computerinfo', createParameterValidator({
    '-property': literal,
  })],
  ['get-counter', createParameterValidator({
    '-counter': literal,
    '-maxsamples': positiveInteger,
    '-sampleinterval': positiveInteger,
  })],
  ['get-culture', noArguments],
  ['get-date', noArguments],
  ['get-host', noArguments],
  ['get-location', noArguments],
  ['get-process', createParameterValidator({
    '-fileversioninfo': false,
    '-id': integer,
    '-includeusername': false,
    '-module': false,
    '-name': literal,
  })],
  ['get-psdrive', createParameterValidator({
    '-literalname': literal,
    '-name': literal,
    '-psprovider': literal,
    '-scope': literal,
  })],
  ['get-psprovider', createParameterValidator({
    '-psprovider': literal,
  })],
  ['get-service', createParameterValidator({
    '-dependentservices': false,
    '-displayname': literal,
    '-exclude': literal,
    '-include': literal,
    '-name': literal,
    '-requiredservices': false,
  })],
  ['get-timezone', createParameterValidator({
    '-id': literal,
    '-listavailable': false,
  })],
  ['get-uiculture', noArguments],
  ['measure-object', createParameterValidator({
    '-allstats': false,
    '-average': false,
    '-character': false,
    '-ignorewhitespace': false,
    '-line': false,
    '-maximum': false,
    '-minimum': false,
    '-property': literal,
    '-sum': false,
    '-word': false,
  })],
  ['out-string', createParameterValidator({
    '-stream': false,
    '-width': positiveInteger,
  })],
  ['select-object', createParameterValidator({
    '-expandproperty': literal,
    '-first': integer,
    '-last': integer,
    '-property': literal,
    '-skip': integer,
    '-skipindex': integer,
    '-unique': false,
    '-wait': false,
  })],
  ['sort-object', createParameterValidator({
    '-casesensitive': false,
    '-descending': false,
    '-property': literal,
    '-stable': false,
    '-unique': false,
  })],
])

export function classifyPowerShellSimpleCommand(
  words: readonly string[],
): ShellCommandApprovalReason | null {
  const command = words[0]?.toLowerCase()
  if (!command || !/^[a-z]+-[a-z][a-z0-9]*$/.test(command))
    return 'unsupported-syntax'
  const validator = commandValidators.get(command)
  if (!validator)
    return 'unknown-command'
  return validator(words.slice(1)) ? null : 'unsafe-arguments'
}

function noArguments(arguments_: readonly string[]): boolean {
  return arguments_.length === 0
}

function createParameterValidator(
  rules: ParameterRules,
): ArgumentValidator {
  return (arguments_) => {
    for (let index = 0; index < arguments_.length; index += 1) {
      const argument = arguments_[index]!
      const key = argument.toLowerCase()
      if (!(key in rules))
        return false
      const rule = rules[key]!
      if (rule === false)
        continue
      const value = arguments_[index + 1]
      if (value === undefined || !rule(value))
        return false
      index += 1
    }
    return true
  }
}
