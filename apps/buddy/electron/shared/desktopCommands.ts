export const DESKTOP_COMMAND_IDS = [
  'app.about',
  'app.checkUpdates',
  'app.quit',
  'window.close',
  'window.toggleDeveloperTools',
  'help.openDocumentation',
  'help.openLogsDirectory',
  'help.feedback',
] as const

export type DesktopCommandId = typeof DESKTOP_COMMAND_IDS[number]
export type DesktopCommandExecution = 'main' | 'renderer'
export type DesktopCommandMenu = 'application' | 'window' | 'help'
export type DesktopCommandScope = 'application' | 'window'
export type DesktopPlatform = 'darwin' | 'linux' | 'win32'

export interface DesktopShortcutBinding {
  alt: boolean
  control: boolean
  key: string
  label: string
  meta: boolean
  shift: boolean
}

export interface DesktopCommandDefinition {
  execution: DesktopCommandExecution
  id: DesktopCommandId
  menu: DesktopCommandMenu
  showInMenu: boolean
  scope: DesktopCommandScope
  section: number
  shortcuts?: Partial<Record<DesktopPlatform, DesktopShortcutSet>> & {
    default: DesktopShortcutSet
  }
}

export type DesktopShortcutSet = DesktopShortcutBinding | ReadonlyArray<DesktopShortcutBinding>

export interface DesktopShortcutInput {
  alt: boolean
  control: boolean
  key: string
  meta: boolean
  shift: boolean
}

const ALT_F4 = shortcut('F4', 'Alt+F4', { alt: true })
const COMMAND_Q = shortcut('q', '⌘Q', { meta: true })
const COMMAND_OPTION_I = shortcut('i', '⌘⌥I', { alt: true, meta: true })
const CONTROL_SHIFT_I = shortcut('i', 'Ctrl+Shift+I', { control: true, shift: true })
const CONTROL_W = shortcut('w', 'Ctrl+W', { control: true })
const COMMAND_W = shortcut('w', '⌘W', { meta: true })
const F12 = shortcut('F12', 'F12', {})

export const DESKTOP_COMMAND_REGISTRY = [
  command('app.about', 'application', 0, 'renderer', 'application'),
  command('app.checkUpdates', 'application', 0, 'renderer', 'application'),
  command('app.quit', 'application', 1, 'main', 'application', {
    darwin: COMMAND_Q,
    default: ALT_F4,
  }),
  command('window.close', 'window', 0, 'main', 'window', {
    darwin: COMMAND_W,
    default: CONTROL_W,
  }),
  command('window.toggleDeveloperTools', 'window', 1, 'main', 'window', {
    darwin: [COMMAND_OPTION_I, F12],
    default: [CONTROL_SHIFT_I, F12],
  }, false),
  command('help.openDocumentation', 'help', 0, 'main', 'application'),
  command('help.openLogsDirectory', 'help', 0, 'main', 'application'),
  command('help.feedback', 'help', 1, 'renderer', 'application'),
] as const satisfies ReadonlyArray<DesktopCommandDefinition>

export function getDesktopCommand(commandId: DesktopCommandId): DesktopCommandDefinition {
  const command = DESKTOP_COMMAND_REGISTRY.find(candidate => candidate.id === commandId)
  if (!command)
    throw new Error(`Unknown Desktop command: ${commandId}`)
  return command
}

export function getDesktopMenuCommands(menu: DesktopCommandMenu): ReadonlyArray<DesktopCommandDefinition> {
  return DESKTOP_COMMAND_REGISTRY.filter(command => command.menu === menu && command.showInMenu)
}

export function isDesktopCommandId(value: unknown): value is DesktopCommandId {
  if (typeof value !== 'string')
    return false
  return (DESKTOP_COMMAND_IDS as ReadonlyArray<string>).includes(value)
}

export function matchesDesktopShortcut(
  input: DesktopShortcutInput,
  shortcut: DesktopShortcutBinding,
): boolean {
  return input.key.toLocaleLowerCase() === shortcut.key.toLocaleLowerCase()
    && input.alt === shortcut.alt
    && input.control === shortcut.control
    && input.meta === shortcut.meta
    && input.shift === shortcut.shift
}

export function resolveDesktopShortcut(
  commandId: DesktopCommandId,
  platform: DesktopPlatform,
): DesktopShortcutBinding | null {
  return resolveDesktopShortcuts(commandId, platform)[0] ?? null
}

export function resolveDesktopShortcuts(
  commandId: DesktopCommandId,
  platform: DesktopPlatform,
): ReadonlyArray<DesktopShortcutBinding> {
  const shortcuts = getDesktopCommand(commandId).shortcuts
  const resolved = shortcuts?.[platform] ?? shortcuts?.default
  if (!resolved)
    return []
  return isDesktopShortcutBinding(resolved) ? [resolved] : resolved
}

export function resolveDesktopPlatform(platform: string): DesktopPlatform {
  if (platform === 'darwin' || platform === 'win32')
    return platform
  return 'linux'
}

function command(
  id: DesktopCommandId,
  menu: DesktopCommandMenu,
  section: number,
  execution: DesktopCommandExecution,
  scope: DesktopCommandScope,
  shortcuts?: DesktopCommandDefinition['shortcuts'],
  showInMenu = true,
): DesktopCommandDefinition {
  return { execution, id, menu, scope, section, shortcuts, showInMenu }
}

function shortcut(
  key: string,
  label: string,
  modifiers: Partial<Pick<DesktopShortcutBinding, 'alt' | 'control' | 'meta' | 'shift'>>,
): DesktopShortcutBinding {
  return {
    alt: false,
    control: false,
    key,
    label,
    meta: false,
    shift: false,
    ...modifiers,
  }
}

function isDesktopShortcutBinding(value: DesktopShortcutSet): value is DesktopShortcutBinding {
  return !Array.isArray(value)
}
