import type { AdminNavigationItem } from './typing'

export const adminNavigationItems: AdminNavigationItem[] = [
  {
    label: '概览',
    icon: 'admin-overview',
    title: '系统概览',
    routeName: 'admin-overview',
    path: '/admin/overview',
  },
  {
    label: '用户',
    icon: 'admin-users',
    title: '用户管理',
    routeName: 'admin-users',
    path: '/admin/users',
  },
  {
    label: '邮件',
    icon: 'admin-email',
    title: '发件配置',
    routeName: 'admin-email',
    path: '/admin/email',
  },
  {
    label: '服务商',
    icon: 'admin-model-providers',
    title: '服务商',
    routeName: 'admin-model-providers',
    path: '/admin/model-providers',
  },
  {
    label: '审计',
    icon: 'admin-audit',
    title: '审计日志',
    routeName: 'admin-audit',
    path: '/admin/audit',
  },
]

export const DEFAULT_ADMIN_NAVIGATION_ITEM = adminNavigationItems[0]
