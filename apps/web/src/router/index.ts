import type { Router, RouterHistory } from 'vue-router'
import { createRouter, createWebHistory } from 'vue-router'
import { rememberWorkspaceEntryPath } from '@/layouts/utils/workspace-entry'
import { useAuthStore } from '@/stores/auth'
import { useUserStore } from '@/stores/user'

import { adminRoute, protectedRoutes, publicRoutes } from './routes'

export function loadAdminRoutes(router: Router) {
  if (router.hasRoute('admin'))
    return
  router.addRoute(adminRoute)
}

export function resetAdminRoutes(router: Router) {
  if (!router.hasRoute('admin'))
    return
  router.removeRoute('admin')
}

export function createAppRouter(history: RouterHistory = createWebHistory()) {
  const router = createRouter({
    history,
    routes: [...publicRoutes, ...protectedRoutes],
  })

  if (useUserStore().isSystemAdmin) {
    loadAdminRoutes(router)
  }

  router.beforeEach((to) => {
    const authStore = useAuthStore()
    const userStore = useUserStore()

    if (to.meta.public) {
      if (authStore.isAuthenticated) {
        return { name: userStore.defaultRouteName }
      }
      return true
    }

    if (to.meta.allowAnonymous) {
      return true
    }

    if (!authStore.isAuthenticated) {
      return {
        name: 'login',
        query: { redirect: to.fullPath },
      }
    }

    if (userStore.requiresPasswordChange && !to.meta.allowWhenPasswordChangeRequired) {
      return { name: 'change-password' }
    }

    if (to.path.startsWith('/admin') && !userStore.isSystemAdmin) {
      return { name: 'home' }
    }

    if (userStore.isSystemAdmin && !router.hasRoute('admin')) {
      loadAdminRoutes(router)
      return to.fullPath
    }

    return true
  })

  router.afterEach((to) => {
    if (
      to.meta.public
      || to.meta.allowAnonymous
      || to.meta.allowWhenPasswordChangeRequired
      || to.path.startsWith('/admin')
    ) {
      return
    }

    rememberWorkspaceEntryPath(to.fullPath)
  })

  return router
}
