import type { RouteRecordRaw } from 'vue-router'
import type { SidebarPanelItem } from '@/layouts/panels/typing'
import { AUTH_CALLBACK_PATH, DOCUMENT_SHARE_ROUTE_PREFIX } from '@haohaoxue/samepage-contracts'
import { SvgIconCategory } from '@/components/svg-icon/typing'
import { ADMIN_ROUTE_NAME, ADMIN_ROUTE_PATH } from './constants'

const WorkspaceContainer = () => import('@/layouts/containers/WorkspaceContainer.vue')
const AuthCallbackView = () => import('@/views/auth/callback/index.vue')
const ChangePasswordView = () => import('@/views/auth/change-password/index.vue')
const LoginView = () => import('@/views/auth/login/index.vue')
const PasswordRegisterVerifyView = () => import('@/views/auth/register-verify/index.vue')
const PasswordRegisterRequestView = () => import('@/views/auth/register/index.vue')
const ChatView = () => import('@/views/chat/index.vue')
// const CodeView = () => import('@/views/code/index.vue') // TODO
const DocsView = () => import('@/views/docs/index.vue')
const DocsDocumentSurfaceView = () => import('@/views/docs/pages/DocsDocumentSurfacePage.vue')
const DocsPendingSharesPageView = () => import('@/views/docs/pages/DocsPendingSharesPage.vue')
const DocsPermissionsPageView = () => import('@/views/docs/pages/DocsPermissionsPage.vue')
const DocsTrashPageView = () => import('@/views/docs/pages/DocsTrashPage.vue')
const AgentView = () => import('@/views/agent/index.vue')
const HomeView = () => import('@/views/home/index.vue')
// const KnowledgeView = () => import('@/views/knowledge/index.vue') // TODO
const ProviderView = () => import('@/views/provider/index.vue')
// const ScheduleView = () => import('@/views/schedule/index.vue') // TODO
const SettingsView = () => import('@/views/settings/index.vue')
const SettingsDefaultModelsPageView = () => import('@/views/settings/pages/SettingsDefaultModelsPage.vue')
const SettingsPreferencePageView = () => import('@/views/settings/pages/SettingsPreferencePage.vue')
const SettingsUserPageView = () => import('@/views/settings/pages/SettingsUserPage.vue')
const SharedDocsView = () => import('@/views/shared-docs/index.vue')

const ADMIN_ROUTE_ENTRY_NAME = 'admin-overview'

export const publicRoutes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { public: true },
  },
  {
    path: AUTH_CALLBACK_PATH,
    name: 'auth-callback',
    component: AuthCallbackView,
    meta: { public: true },
  },
  {
    path: '/register',
    name: 'register',
    component: PasswordRegisterRequestView,
    meta: { public: true },
  },
  {
    path: '/register/verify',
    name: 'register-verify',
    component: PasswordRegisterVerifyView,
    meta: { public: true },
  },
]

const workspaceRouteChildren = [
  {
    path: '',
    redirect: '/home',
  },
  {
    path: 'home',
    name: 'home',
    component: HomeView,
    meta: {
      navLabel: '主页',
      navIconCategory: SvgIconCategory.NAV,
      navIcon: 'home',
      navActiveIcon: 'home-active',
    },
  },
  {
    path: 'chat',
    name: 'chat',
    component: ChatView,
    meta: {
      navLabel: '对话',
      navIconCategory: SvgIconCategory.NAV,
      navIcon: 'chat',
      navActiveIcon: 'chat-active',
    },
  },
  {
    path: 'docs',
    name: 'docs-nav',
    component: DocsView,
    meta: {
      navLabel: '文档',
      navIconCategory: SvgIconCategory.NAV,
      navIcon: 'docs',
      navActiveIcon: 'docs-active',
    },
    children: [
      {
        path: 'pending-shares',
        name: 'docs-pending-shares',
        component: DocsPendingSharesPageView,
      },
      {
        path: 'permissions',
        name: 'docs-permissions',
        component: DocsPermissionsPageView,
      },
      {
        path: 'trash',
        name: 'docs-trash',
        component: DocsTrashPageView,
      },
      {
        path: ':id?',
        name: 'docs',
        component: DocsDocumentSurfaceView,
      },
    ],
  },
  // {
  //   path: 'code',
  //   name: 'code',
  //   component: CodeView,
  //   meta: {
  //     navLabel: '代码',
  //     navIconCategory: SvgIconCategory.NAV,
  //     navIcon: 'code',
  //     navActiveIcon: 'code-active',
  //   },
  // },
  // {
  //   path: 'schedule',
  //   name: 'schedule',
  //   component: ScheduleView,
  //   meta: {
  //     navLabel: '日程',
  //     navIconCategory: SvgIconCategory.NAV,
  //     navIcon: 'schedule',
  //     navActiveIcon: 'schedule-active',
  //   },
  // },
  // {
  //   path: 'knowledge',
  //   name: 'knowledge',
  //   component: KnowledgeView,
  //   meta: {
  //     navLabel: '知识库',
  //     navIconCategory: SvgIconCategory.NAV,
  //     navIcon: 'knowledge',
  //     navActiveIcon: 'knowledge-active',
  //   },
  // },
  {
    path: 'agent',
    name: 'agent',
    component: AgentView,
    meta: {
      navLabel: '智能体',
      navIconCategory: SvgIconCategory.NAV,
      navIcon: 'model-service',
      navActiveIcon: 'model-service-active',
    },
  },
  {
    path: 'provider',
    name: 'provider',
    component: ProviderView,
    meta: {
      navLabel: '服务商',
      navIconCategory: SvgIconCategory.NAV,
      navIcon: 'model-providers',
      navActiveIcon: 'model-providers-active',
    },
  },
  {
    path: 'settings',
    name: 'settings',
    component: SettingsView,
    redirect: { name: 'settings-user' },
    meta: {
      navLabel: '设置',
      navIconCategory: SvgIconCategory.NAV,
      navIcon: 'user-settings',
      navActiveIcon: 'user-settings-active',
    },
    children: [
      {
        path: 'user',
        name: 'settings-user',
        component: SettingsUserPageView,
      },
      {
        path: 'preference',
        name: 'settings-preference',
        component: SettingsPreferencePageView,
      },
      {
        path: 'models-default',
        name: 'settings-models-default',
        component: SettingsDefaultModelsPageView,
      },
    ],
  },
] satisfies RouteRecordRaw[]

const adminRouteChildren = [
  {
    path: 'overview',
    name: ADMIN_ROUTE_ENTRY_NAME,
    component: () => import('@/views/system-admin/overview/index.vue'),
    meta: {
      navLabel: '概览',
      navIconCategory: SvgIconCategory.NAV,
      navIcon: 'overview',
      navActiveIcon: 'overview-active',
    },
  },
  {
    path: 'users',
    name: 'admin-users',
    component: () => import('@/views/system-admin/users/index.vue'),
    meta: {
      navLabel: '用户',
      navIconCategory: SvgIconCategory.NAV,
      navIcon: 'users',
      navActiveIcon: 'users-active',
    },
  },
  {
    path: 'email',
    name: 'admin-email',
    component: () => import('@/views/system-admin/email/index.vue'),
    meta: {
      navLabel: '邮件',
      navIconCategory: SvgIconCategory.NAV,
      navIcon: 'email',
      navActiveIcon: 'email-active',
    },
  },
  {
    path: 'providers',
    name: 'admin-providers',
    component: () => import('@/views/system-admin/providers/index.vue'),
    meta: {
      navLabel: '服务商',
      navIconCategory: SvgIconCategory.NAV,
      navIcon: 'model-providers',
      navActiveIcon: 'model-providers-active',
    },
  },
  {
    path: 'audit',
    name: 'admin-audit',
    component: () => import('@/views/system-admin/audit/index.vue'),
    meta: {
      navLabel: '审计',
      navIconCategory: SvgIconCategory.NAV,
      navIcon: 'audit',
      navActiveIcon: 'audit-active',
    },
  },
] satisfies RouteRecordRaw[]

export const adminNavigationItems: SidebarPanelItem[] = createNavigationItems(adminRouteChildren)

export const workspaceNavigationItems: SidebarPanelItem[] = createNavigationItems(workspaceRouteChildren)

export const protectedRoutes: RouteRecordRaw[] = [
  {
    path: `${DOCUMENT_SHARE_ROUTE_PREFIX}/recipients/:recipientId`,
    name: 'shared-doc-recipient',
    component: SharedDocsView,
    meta: { allowAnonymous: true },
  },
  {
    path: `${DOCUMENT_SHARE_ROUTE_PREFIX}/:shareId`,
    name: 'shared-docs',
    component: SharedDocsView,
    meta: { allowAnonymous: true },
  },
  {
    path: '/auth/change-password',
    name: 'change-password',
    component: ChangePasswordView,
    meta: { allowWhenPasswordChangeRequired: true },
  },
  {
    path: '/',
    component: WorkspaceContainer,
    children: workspaceRouteChildren,
  },
]

export const adminRoute: RouteRecordRaw = {
  path: ADMIN_ROUTE_PATH,
  name: ADMIN_ROUTE_NAME,
  component: WorkspaceContainer,
  redirect: { name: ADMIN_ROUTE_ENTRY_NAME },
  meta: { requiresSystemAdmin: true },
  children: adminRouteChildren,
}

function createNavigationItems(routes: RouteRecordRaw[]): SidebarPanelItem[] {
  return routes.flatMap((route) => {
    const routeMeta = route.meta

    if (!route.name || !routeMeta?.navLabel || !routeMeta.navIconCategory || !routeMeta.navIcon) {
      return []
    }

    return [{
      name: route.name,
      to: { name: route.name },
      label: routeMeta.navLabel,
      iconCategory: routeMeta.navIconCategory,
      icon: routeMeta.navIcon,
      activeIcon: routeMeta.navActiveIcon,
    }]
  })
}
