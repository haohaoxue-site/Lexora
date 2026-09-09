import type { RouteRecordRaw } from 'vue-router'
import { DESKTOP_ROUTE_NAMES, desktopRouteLocations } from '@/shared/navigation/desktopRoutes'

export const settingsRoutes: ReadonlyArray<RouteRecordRaw> = [
  {
    path: '/settings',
    component: () => import('./pages/DesktopSettingsLayout.vue'),
    meta: { desktopView: 'settings' },
    redirect: desktopRouteLocations.settings(),
    children: [
      {
        path: 'logs',
        name: DESKTOP_ROUTE_NAMES.settingsLogs,
        component: () => import('./pages/DesktopLogsSettingsView.vue'),
        meta: { desktopView: 'settings', settingsCategory: 'logs' },
      },
      {
        path: 'web',
        name: DESKTOP_ROUTE_NAMES.settingsWeb,
        component: () => import('./pages/DesktopWebSettingsView.vue'),
        meta: { desktopView: 'settings', settingsCategory: 'web' },
      },
      {
        path: 'app',
        name: DESKTOP_ROUTE_NAMES.settingsApp,
        component: () => import('./pages/DesktopAppSettingsView.vue'),
        meta: { desktopView: 'settings', settingsCategory: 'app' },
      },
      {
        path: 'models',
        name: DESKTOP_ROUTE_NAMES.settingsModels,
        component: () => import('./pages/DesktopModelsSettingsView.vue'),
        meta: { desktopView: 'settings', settingsCategory: 'models' },
      },
      {
        path: 'models/:providerId',
        name: DESKTOP_ROUTE_NAMES.settingsProvider,
        component: () => import('./pages/DesktopProviderSettingsView.vue'),
        props: true,
        meta: { desktopView: 'settings', settingsCategory: 'models' },
      },
      {
        path: 'pet',
        name: DESKTOP_ROUTE_NAMES.settingsPet,
        component: () => import('./pages/DesktopPetSettingsView.vue'),
        meta: { desktopView: 'settings', settingsCategory: 'pet' },
      },
    ],
  },
]
