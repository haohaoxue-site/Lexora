const REGISTRATION_INVITE_GRANT_KEY = 'samepage_registration_invite_grant'

interface StoredRegistrationInviteGrant {
  email: string
  token: string
}

export function savePasswordRegistrationInviteGrant(input: StoredRegistrationInviteGrant): void {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.setItem(REGISTRATION_INVITE_GRANT_KEY, JSON.stringify(input))
}

export function consumePasswordRegistrationInviteGrant(email: string): string | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  const rawValue = window.sessionStorage.getItem(REGISTRATION_INVITE_GRANT_KEY)

  if (!rawValue) {
    return undefined
  }

  const grant = parseStoredRegistrationInviteGrant(rawValue)

  if (!grant || grant.email !== email) {
    return undefined
  }

  return grant.token
}

export function clearPasswordRegistrationInviteGrant(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.removeItem(REGISTRATION_INVITE_GRANT_KEY)
}

function parseStoredRegistrationInviteGrant(value: string): StoredRegistrationInviteGrant | null {
  try {
    const parsed = JSON.parse(value) as Partial<StoredRegistrationInviteGrant>

    if (typeof parsed.email === 'string' && typeof parsed.token === 'string') {
      return {
        email: parsed.email,
        token: parsed.token,
      }
    }
  }
  catch {
  }

  return null
}
