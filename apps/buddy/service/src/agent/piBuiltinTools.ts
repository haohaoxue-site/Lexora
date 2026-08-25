export const PI_BUILTIN_TOOL_NAMES = [
  'bash',
  'edit',
  'find',
  'grep',
  'ls',
  'read',
  'write',
] as const

export const PI_BUILTIN_TOOL_NAME_SET: ReadonlySet<string> = new Set(PI_BUILTIN_TOOL_NAMES)
