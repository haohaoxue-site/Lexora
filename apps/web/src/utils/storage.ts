export const STORAGE_KEY = {
  auth: 'samepage_ai.auth',
  authRedirect: 'samepage_ai.auth_redirect',
  registrationInviteGrant: 'samepage_ai.registration_invite_grant',
  ui: 'samepage_ai.ui',
  user: 'samepage_ai.user',
  workspace: 'samepage_ai.workspace',
  workspaceEntry: 'samepage_ai.workspace_entry',
} as const

export function getLocalStorage() {
  return window.localStorage
}

export function getSessionStorage() {
  return window.sessionStorage
}
