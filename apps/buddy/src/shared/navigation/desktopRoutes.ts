import type { RouteLocationRaw } from 'vue-router'

export type DesktopView = 'automations' | 'settings' | 'tasks'
export type DesktopAutomationSection = 'history' | 'plans'
export type DesktopSettingsCategory = 'app' | 'models' | 'pet' | 'local' | 'data' | 'web'

export const DESKTOP_ROUTE_NAMES = {
  automations: 'desktop.automations',
  automationsCreate: 'desktop.automations.create',
  automationsEdit: 'desktop.automations.edit',
  automationsHistory: 'desktop.automations.history',
  automationsPlans: 'desktop.automations.plans',
  settingsApp: 'desktop.settings.app',
  settingsData: 'desktop.settings.data',
  settingsLocal: 'desktop.settings.local',
  settingsWeb: 'desktop.settings.web',
  settingsModels: 'desktop.settings.models',
  settingsPet: 'desktop.settings.pet',
  settingsProvider: 'desktop.settings.models.provider',
  tasks: 'desktop.tasks',
} as const

const AUTOMATION_ROUTE_NAMES: Record<DesktopAutomationSection, string> = {
  history: DESKTOP_ROUTE_NAMES.automationsHistory,
  plans: DESKTOP_ROUTE_NAMES.automationsPlans,
}

const SETTINGS_ROUTE_NAMES: Record<DesktopSettingsCategory, string> = {
  app: DESKTOP_ROUTE_NAMES.settingsApp,
  data: DESKTOP_ROUTE_NAMES.settingsData,
  local: DESKTOP_ROUTE_NAMES.settingsLocal,
  web: DESKTOP_ROUTE_NAMES.settingsWeb,
  models: DESKTOP_ROUTE_NAMES.settingsModels,
  pet: DESKTOP_ROUTE_NAMES.settingsPet,
}

export const desktopRouteLocations = {
  automationCreate: (): RouteLocationRaw => ({
    name: DESKTOP_ROUTE_NAMES.automationsCreate,
  }),
  automationEdit: (automationId: string): RouteLocationRaw => ({
    name: DESKTOP_ROUTE_NAMES.automationsEdit,
    params: { automationId },
  }),
  automations: (section: DesktopAutomationSection = 'plans'): RouteLocationRaw => ({
    name: AUTOMATION_ROUTE_NAMES[section],
  }),
  provider: (providerId: string): RouteLocationRaw => ({
    name: DESKTOP_ROUTE_NAMES.settingsProvider,
    params: { providerId },
  }),
  settings: (category: DesktopSettingsCategory = 'app'): RouteLocationRaw => ({
    name: SETTINGS_ROUTE_NAMES[category],
  }),
  tasks: (): RouteLocationRaw => ({ name: DESKTOP_ROUTE_NAMES.tasks }),
}

declare module 'vue-router' {
  interface RouteMeta {
    automationSection?: DesktopAutomationSection
    desktopView?: DesktopView
    settingsCategory?: DesktopSettingsCategory
  }
}
