import type { RouteRecordRaw } from 'vue-router'
import type { AdminRouteName, WorkspaceNavigationItem, WorkspaceNavigationMeta } from './typing'
import { AUTH_CALLBACK_PATH, DOCUMENT_SHARE_ROUTE_PREFIX } from '@haohaoxue/samepage-contracts'
import { SvgIconCategory } from '@/components/svg-icon/typing'
import { adminNavigationItems } from './navigation'

const AdminShellContainer = () => import('@/layouts/containers/admin-shell.vue')
const WorkspaceContainer = () => import('@/layouts/containers/workspace.vue')
const AuthCallbackView = () => import('@/views/auth/callback/index.vue')
const ChangePasswordView = () => import('@/views/auth/change-password/index.vue')
const LoginView = () => import('@/views/auth/login/index.vue')
const PasswordRegisterVerifyView = () => import('@/views/auth/register-verify/index.vue')
const PasswordRegisterRequestView = () => import('@/views/auth/register/index.vue')
const ChatView = () => import('@/views/chat/index.vue')
const DocsView = () => import('@/views/docs/index.vue')
const DocsDocumentSurfaceView = () => import('@/views/docs/pages/DocsDocumentSurfacePage.vue')
const DocsPendingSharesPageView = () => import('@/views/docs/pages/DocsPendingSharesPage.vue')
const DocsPermissionsPageView = () => import('@/views/docs/pages/DocsPermissionsPage.vue')
const DocsTrashPageView = () => import('@/views/docs/pages/DocsTrashPage.vue')
const HomeView = () => import('@/views/home/index.vue')
const KnowledgeView = () => import('@/views/knowledge/index.vue')
const ProviderView = () => import('@/views/provider/index.vue')
const ProviderDefaultModelsPageView = () => import('@/views/provider/pages/ProviderDefaultModelsPage.vue')
const ProviderModelServicesPageView = () => import('@/views/provider/pages/ProviderModelServicesPage.vue')
const SharedDocsView = () => import('@/views/shared-docs/index.vue')
const UserSettingsView = () => import('@/views/user/index.vue')

const adminRouteComponents = {
  'admin-overview': () => import('@/views/system-admin/overview/index.vue'),
  'admin-users': () => import('@/views/system-admin/users/index.vue'),
  'admin-email': () => import('@/views/system-admin/email/index.vue'),
  'admin-model-providers': () => import('@/views/system-admin/model-providers/index.vue'),
  'admin-audit': () => import('@/views/system-admin/audit/index.vue'),
} satisfies Record<AdminRouteName, RouteRecordRaw['component']>

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
      workspaceNav: defineWorkspaceNavigationMeta({
        label: '主页',
        iconCategory: SvgIconCategory.NAV,
        icon: 'home',
        activeIcon: 'home-active',
      }),
    },
  },
  {
    path: 'chat',
    name: 'chat',
    component: ChatView,
    meta: {
      workspaceNav: defineWorkspaceNavigationMeta({
        label: '聊天助手',
        iconCategory: SvgIconCategory.NAV,
        icon: 'chat',
        activeIcon: 'chat-active',
      }),
    },
  },
  {
    path: 'docs',
    name: 'docs-nav',
    component: DocsView,
    meta: {
      workspaceNav: defineWorkspaceNavigationMeta({
        label: '文档',
        iconCategory: SvgIconCategory.NAV,
        icon: 'docs',
        activeIcon: 'docs-active',
      }),
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
  {
    path: 'knowledge',
    name: 'knowledge',
    component: KnowledgeView,
    meta: {
      workspaceNav: defineWorkspaceNavigationMeta({
        label: '知识库',
        iconCategory: SvgIconCategory.NAV,
        icon: 'knowledge',
        activeIcon: 'knowledge-active',
      }),
    },
  },
  {
    path: 'provider',
    name: 'provider',
    component: ProviderView,
    redirect: '/provider/models',
    meta: {
      workspaceNav: defineWorkspaceNavigationMeta({
        label: '模型服务',
        iconCategory: SvgIconCategory.NAV,
        icon: 'model-service',
        activeIcon: 'model-service-active',
      }),
    },
    children: [
      {
        path: 'models',
        name: 'provider-models',
        component: ProviderModelServicesPageView,
      },
      {
        path: 'usage',
        name: 'provider-usage',
        component: ProviderDefaultModelsPageView,
      },
    ],
  },
  {
    path: 'user',
    name: 'user',
    component: UserSettingsView,
    meta: {
      workspaceNav: defineWorkspaceNavigationMeta({
        label: '个人设置',
        iconCategory: SvgIconCategory.NAV,
        icon: 'user-settings',
        activeIcon: 'user-settings-active',
      }),
    },
  },
] satisfies RouteRecordRaw[]

export const workspaceNavigationItems: WorkspaceNavigationItem[] = workspaceRouteChildren.flatMap((route) => {
  const workspaceNav = route.meta?.workspaceNav

  if (!workspaceNav || !route.name) {
    return []
  }

  return [{
    id: String(route.name),
    label: workspaceNav.label,
    iconCategory: workspaceNav.iconCategory,
    icon: workspaceNav.icon,
    activeIcon: workspaceNav.activeIcon,
    to: normalizeWorkspaceNavigationPath(route.path),
  }]
})

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
  path: '/admin',
  name: 'admin',
  component: AdminShellContainer,
  redirect: '/admin/overview',
  children: [
    ...adminNavigationItems.map(item => ({
      path: item.path.replace('/admin/', ''),
      name: item.routeName,
      component: adminRouteComponents[item.routeName],
    })),
  ],
}

function normalizeWorkspaceNavigationPath(path: string) {
  const [staticPath] = path.split('/:')
  const normalizedPath = staticPath || ''

  return normalizedPath.startsWith('/')
    ? normalizedPath || '/'
    : `/${normalizedPath}`
}

function defineWorkspaceNavigationMeta(meta: WorkspaceNavigationMeta) {
  return meta
}
