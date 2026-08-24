import type {
  RouteLocationRaw,
  RouteRecordRaw,
  RouterHistory,
} from 'vue-router'
import {
  createRouter,
  createWebHashHistory,
} from 'vue-router'

export type DesktopView = 'automations' | 'chat' | 'settings'
export type DesktopAutomationSection = 'history' | 'tasks'
export type DesktopSettingsCategory = 'app' | 'models' | 'pet' | 'local' | 'data'

export const DESKTOP_ROUTE_NAMES = {
  automations: 'desktop.automations',
  automationsCreate: 'desktop.automations.create',
  automationsEdit: 'desktop.automations.edit',
  automationsHistory: 'desktop.automations.history',
  automationsTasks: 'desktop.automations.tasks',
  chat: 'desktop.chat',
  settingsApp: 'desktop.settings.app',
  settingsData: 'desktop.settings.data',
  settingsLocal: 'desktop.settings.local',
  settingsModels: 'desktop.settings.models',
  settingsPet: 'desktop.settings.pet',
  settingsProvider: 'desktop.settings.models.provider',
} as const

const AUTOMATION_ROUTE_NAMES: Record<DesktopAutomationSection, string> = {
  history: DESKTOP_ROUTE_NAMES.automationsHistory,
  tasks: DESKTOP_ROUTE_NAMES.automationsTasks,
}

const SETTINGS_ROUTE_NAMES: Record<DesktopSettingsCategory, string> = {
  app: DESKTOP_ROUTE_NAMES.settingsApp,
  data: DESKTOP_ROUTE_NAMES.settingsData,
  local: DESKTOP_ROUTE_NAMES.settingsLocal,
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
  automations: (section: DesktopAutomationSection = 'tasks'): RouteLocationRaw => ({
    name: AUTOMATION_ROUTE_NAMES[section],
  }),
  chat: (): RouteLocationRaw => ({ name: DESKTOP_ROUTE_NAMES.chat }),
  provider: (providerId: string): RouteLocationRaw => ({
    name: DESKTOP_ROUTE_NAMES.settingsProvider,
    params: { providerId },
  }),
  settings: (category: DesktopSettingsCategory = 'app'): RouteLocationRaw => ({
    name: SETTINGS_ROUTE_NAMES[category],
  }),
}

const routes: ReadonlyArray<RouteRecordRaw> = [
  {
    path: '/',
    redirect: desktopRouteLocations.chat(),
  },
  {
    path: '/chat',
    name: DESKTOP_ROUTE_NAMES.chat,
    component: () => import('../views/DesktopChatView.vue'),
    meta: { desktopView: 'chat' },
  },
  {
    path: '/automations',
    name: DESKTOP_ROUTE_NAMES.automations,
    component: () => import('../views/automations/DesktopAutomationsLayout.vue'),
    meta: { desktopView: 'automations' },
    children: [
      {
        path: '',
        component: () => import('../views/automations/DesktopAutomationIndexLayout.vue'),
        redirect: desktopRouteLocations.automations(),
        children: [
          {
            path: 'tasks',
            name: DESKTOP_ROUTE_NAMES.automationsTasks,
            component: () => import('../views/automations/DesktopAutomationTasksView.vue'),
            meta: { automationSection: 'tasks', desktopView: 'automations' },
          },
          {
            path: 'history',
            name: DESKTOP_ROUTE_NAMES.automationsHistory,
            component: () => import('../views/automations/DesktopAutomationHistoryView.vue'),
            meta: { automationSection: 'history', desktopView: 'automations' },
          },
        ],
      },
      {
        path: 'tasks/new',
        name: DESKTOP_ROUTE_NAMES.automationsCreate,
        component: () => import('../views/automations/DesktopAutomationEditorView.vue'),
        props: { automationId: null },
        meta: { automationSection: 'tasks', desktopView: 'automations' },
      },
      {
        path: 'tasks/:automationId/edit',
        name: DESKTOP_ROUTE_NAMES.automationsEdit,
        component: () => import('../views/automations/DesktopAutomationEditorView.vue'),
        props: true,
        meta: { automationSection: 'tasks', desktopView: 'automations' },
      },
    ],
  },
  {
    path: '/settings',
    component: () => import('../views/settings/DesktopSettingsLayout.vue'),
    meta: { desktopView: 'settings' },
    redirect: desktopRouteLocations.settings(),
    children: [
      {
        path: 'app',
        name: DESKTOP_ROUTE_NAMES.settingsApp,
        component: () => import('../views/settings/DesktopAppSettingsView.vue'),
        meta: { desktopView: 'settings', settingsCategory: 'app' },
      },
      {
        path: 'models',
        name: DESKTOP_ROUTE_NAMES.settingsModels,
        component: () => import('../views/settings/DesktopModelsSettingsView.vue'),
        meta: { desktopView: 'settings', settingsCategory: 'models' },
      },
      {
        path: 'models/:providerId',
        name: DESKTOP_ROUTE_NAMES.settingsProvider,
        component: () => import('../views/settings/DesktopProviderSettingsView.vue'),
        props: true,
        meta: { desktopView: 'settings', settingsCategory: 'models' },
      },
      {
        path: 'pet',
        name: DESKTOP_ROUTE_NAMES.settingsPet,
        component: () => import('../views/settings/DesktopPetSettingsView.vue'),
        meta: { desktopView: 'settings', settingsCategory: 'pet' },
      },
      {
        path: 'local',
        name: DESKTOP_ROUTE_NAMES.settingsLocal,
        component: () => import('../views/settings/DesktopLocalSettingsView.vue'),
        meta: { desktopView: 'settings', settingsCategory: 'local' },
      },
      {
        path: 'data',
        name: DESKTOP_ROUTE_NAMES.settingsData,
        component: () => import('../views/settings/DesktopDataSettingsView.vue'),
        meta: { desktopView: 'settings', settingsCategory: 'data' },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: desktopRouteLocations.chat(),
  },
]

export function createDesktopRouter(history: RouterHistory = createWebHashHistory()) {
  return createRouter({ history, routes })
}

declare module 'vue-router' {
  interface RouteMeta {
    automationSection?: DesktopAutomationSection
    desktopView?: DesktopView
    settingsCategory?: DesktopSettingsCategory
  }
}
