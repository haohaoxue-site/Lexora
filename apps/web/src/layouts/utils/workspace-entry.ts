import { isAdminRoutePath } from '@/router/constants'

const WORKSPACE_ENTRY_STORAGE_KEY = 'samepage_workspace_entry'
const WORKSPACE_HOME_PATH = '/'

export function rememberWorkspaceEntryPath(path: string) {
  if (typeof window === 'undefined' || !path || isAdminRoutePath(path)) {
    return
  }

  window.sessionStorage.setItem(WORKSPACE_ENTRY_STORAGE_KEY, path)
}

export function getWorkspaceEntryPath() {
  if (typeof window === 'undefined') {
    return WORKSPACE_HOME_PATH
  }

  return window.sessionStorage.getItem(WORKSPACE_ENTRY_STORAGE_KEY) || WORKSPACE_HOME_PATH
}
