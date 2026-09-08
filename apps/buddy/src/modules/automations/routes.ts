import type { RouteRecordRaw } from 'vue-router'
import { DESKTOP_ROUTE_NAMES, desktopRouteLocations } from '@/shared/navigation/desktopRoutes'

export const automationsRoutes: ReadonlyArray<RouteRecordRaw> = [
  {
    path: '/automations',
    name: DESKTOP_ROUTE_NAMES.automations,
    component: () => import('./pages/DesktopAutomationsLayout.vue'),
    meta: { desktopView: 'automations' },
    children: [
      {
        path: '',
        component: () => import('./pages/DesktopAutomationIndexLayout.vue'),
        redirect: desktopRouteLocations.automations(),
        children: [
          {
            path: 'plans',
            name: DESKTOP_ROUTE_NAMES.automationsPlans,
            component: () => import('./pages/DesktopAutomationPlansView.vue'),
            meta: { automationSection: 'plans', desktopView: 'automations' },
          },
          {
            path: 'history',
            name: DESKTOP_ROUTE_NAMES.automationsHistory,
            component: () => import('./pages/DesktopAutomationHistoryView.vue'),
            meta: { automationSection: 'history', desktopView: 'automations' },
          },
        ],
      },
      {
        path: 'plans/new',
        name: DESKTOP_ROUTE_NAMES.automationsCreate,
        component: () => import('./pages/DesktopAutomationEditorView.vue'),
        props: { automationId: null },
        meta: { automationSection: 'plans', desktopView: 'automations' },
      },
      {
        path: 'plans/:automationId/edit',
        name: DESKTOP_ROUTE_NAMES.automationsEdit,
        component: () => import('./pages/DesktopAutomationEditorView.vue'),
        props: true,
        meta: { automationSection: 'plans', desktopView: 'automations' },
      },
    ],
  },
]
