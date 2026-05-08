export const ADMIN_ROUTE_NAME = 'admin'

export const ADMIN_ROUTE_PATH = '/admin'

export function isAdminRoutePath(path: string) {
  return path === ADMIN_ROUTE_PATH || path.startsWith(`${ADMIN_ROUTE_PATH}/`)
}
