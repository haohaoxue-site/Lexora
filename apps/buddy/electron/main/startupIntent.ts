export type DesktopLaunchIntent = 'background' | 'foreground'

export function resolveDesktopLaunchIntent(argv: readonly string[]): DesktopLaunchIntent {
  return argv.includes('--background') ? 'background' : 'foreground'
}
