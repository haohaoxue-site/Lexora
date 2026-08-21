export type DesktopView = 'chat' | 'settings'
export type DesktopSettingsCategory = 'app' | 'models' | 'pet' | 'local' | 'data'

export type DesktopRoute
  = | { view: 'chat' }
    | { view: 'settings', category: DesktopSettingsCategory }

interface DesktopLocation {
  hash: string
  pathname: string
}

const DESKTOP_SETTINGS_CATEGORIES: ReadonlySet<string> = new Set([
  'app',
  'models',
  'pet',
  'local',
  'data',
])

export function resolveDesktopRoute(location: DesktopLocation): DesktopRoute {
  const hashRoute = parseDesktopRoute(location.hash.replace(/^#/, ''))
  if (hashRoute)
    return hashRoute

  const pathRoute = parseDesktopRoute(location.pathname.split('/').filter(Boolean).at(-1)?.replace(/\.html$/, '') ?? '')
  return pathRoute ?? { view: 'chat' }
}

export function toDesktopRouteHash(route: DesktopRoute): string {
  if (route.view === 'settings')
    return `#settings/${route.category}`

  return '#chat'
}

function parseDesktopRoute(value: string): DesktopRoute | null {
  const [view, detail] = value.split('/')
  if (view === 'chat')
    return { view: 'chat' }
  if (view === 'settings') {
    return {
      category: isDesktopSettingsCategory(detail) ? detail : 'app',
      view,
    }
  }

  return null
}

function isDesktopSettingsCategory(value: string | undefined): value is DesktopSettingsCategory {
  return value !== undefined && DESKTOP_SETTINGS_CATEGORIES.has(value)
}
