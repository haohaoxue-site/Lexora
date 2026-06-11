import type { RouteRecordRaw } from 'vue-router'
import type { SidebarPanelItem } from '@/layouts/panels/typing'
import { AUTH_CALLBACK_PATH } from '@haohaoxue/samepage-contracts/auth/constants'
import {
  DOCUMENT_SINGLE_PUBLICATION_ROUTE_PREFIX,
  DOCUMENT_SITE_PUBLICATION_ROUTE_PREFIX,
} from '@haohaoxue/samepage-contracts/document/publication/constants'
import { RouterView } from 'vue-router'
import { SvgIconCategory } from '@/components/svg-icon/typing'
import {
  ADMIN_ROUTE_NAME,
  ADMIN_ROUTE_PATH,
  SKILLS_MARKET_ROUTE_NAME,
  SKILLS_ME_ROUTE_NAME,
  SKILLS_ROUTE_NAME,
} from './constants'

const WorkspaceContainer = () => import('@/layouts/containers/workspace-container')
const AdminView = () => import('@/views/admin')
const AuthCallbackView = () => import('@/views/auth/pages/callback')
const ChangePasswordView = () => import('@/views/auth/pages/change-password')
const CollaborationResolverPageView = () => import('@/views/collaboration')
const LoginView = () => import('@/views/auth/pages/login')
const PasswordRegisterVerifyView = () => import('@/views/auth/pages/register-verify')
const PasswordRegisterRequestView = () => import('@/views/auth/pages/register')
const ChatView = () => import('@/views/chat/index.vue')
// const CodeView = () => import('@/views/code/index.vue') // TODO
const DocsView = () => import('@/views/docs/index.vue')
const DocsCollaborationsPageView = () => import('@/views/docs/pages/collaborations')
const DocsDocumentSurfaceView = () => import('@/views/docs/pages/document-surface')
const DocsPublicationSettingsPageView = () => import('@/views/docs/pages/publication-settings')
const DocsTrashPageView = () => import('@/views/docs/pages/trash')
const SkillsView = () => import('@/views/skills/index.vue')
// const KnowledgeView = () => import('@/views/knowledge/index.vue') // TODO
// const ScheduleView = () => import('@/views/schedule/index.vue') // TODO
const SettingsView = () => import('@/views/settings/index.vue')
const SettingsPreferencePageView = () => import('@/views/settings/pages/preference')
const SettingsProvidersPageView = () => import('@/views/settings/pages/providers')
const SettingsUserPageView = () => import('@/views/settings/pages/user')
const PublicationView = () => import('@/views/publications/index.vue')

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
    name: 'home',
    component: ChatView,
    meta: {
      navLabel: '对话',
      navIconCategory: SvgIconCategory.NAV,
      navIcon: 'chat',
      navActiveIcon: 'chat-active',
    },
  },
  {
    path: 'chat/:sessionId',
    name: 'chat',
    component: ChatView,
  },
  {
    path: 'r/:code',
    name: 'collaboration-resolver',
    component: CollaborationResolverPageView,
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
        path: 'collaborations',
        name: 'docs-collaborations',
        component: DocsCollaborationsPageView,
      },
      {
        path: 'trash',
        name: 'docs-trash',
        component: DocsTrashPageView,
      },
      {
        path: 'publications',
        name: 'docs-publications',
        component: DocsPublicationSettingsPageView,
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
    path: 'skills',
    name: SKILLS_ROUTE_NAME,
    component: RouterView,
    redirect: { name: SKILLS_ME_ROUTE_NAME },
    meta: {
      navLabel: '技能',
      navIconCategory: SvgIconCategory.NAV,
      navIcon: 'skills',
      navActiveIcon: 'skills-active',
    },
    children: [
      {
        path: 'market',
        name: SKILLS_MARKET_ROUTE_NAME,
        component: SkillsView,
      },
      {
        path: 'me',
        name: SKILLS_ME_ROUTE_NAME,
        component: SkillsView,
      },
    ],
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
        path: 'providers',
        name: 'settings-providers',
        component: SettingsProvidersPageView,
      },
    ],
  },
  {
    path: ':pathMatch(.*)*',
    redirect: '/',
  },
] satisfies RouteRecordRaw[]

const adminRouteChildren = [
  {
    path: 'overview',
    name: ADMIN_ROUTE_ENTRY_NAME,
    component: () => import('@/views/admin/pages/overview'),
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
    component: () => import('@/views/admin/pages/users'),
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
    component: () => import('@/views/admin/pages/email'),
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
    component: () => import('@/views/admin/pages/providers'),
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
    component: () => import('@/views/admin/pages/audit'),
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
    path: `${DOCUMENT_SINGLE_PUBLICATION_ROUTE_PREFIX}/:documentId`,
    name: 'publication-single',
    component: PublicationView,
    meta: { allowAnonymous: true },
  },
  {
    path: `${DOCUMENT_SITE_PUBLICATION_ROUTE_PREFIX}/:siteId/:documentId`,
    name: 'publication-site-document',
    component: PublicationView,
    meta: { allowAnonymous: true },
  },
  {
    path: `${DOCUMENT_SITE_PUBLICATION_ROUTE_PREFIX}/:siteId`,
    name: 'publication-site',
    component: PublicationView,
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
  component: AdminView,
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
