import { homedir } from 'node:os'
import { basename, isAbsolute, resolve, sep } from 'node:path'
import process from 'node:process'

const HOME_RELATIVE_ROOTS = [
  '.aws',
  '.config/gcloud',
  '.config/google-chrome',
  '.config/chromium',
  '.docker',
  '.gnupg',
  '.kube',
  '.local/share/keyrings',
  '.mozilla',
  '.npmrc',
  '.pgpass',
  '.ssh',
  'Library/Keychains',
  'Library/Application Support/Google/Chrome',
  'Library/Application Support/Firefox',
]

const ABSOLUTE_ROOTS = [
  '/etc/shadow',
  '/etc/sudoers',
]

const ENVIRONMENT_ROOT_KEYS = [
  'APPDATA',
  'LOCALAPPDATA',
] as const

const ENVIRONMENT_RELATIVE_ROOTS = [
  'Microsoft/Credentials',
  'Microsoft/Protect',
  'Microsoft/Vault',
]

const SENSITIVE_BASENAME_PATTERN
  = /^(?:\.env(?:\..+)?|\.netrc|_netrc|\.pgpass|id_(?:rsa|dsa|ecdsa|ed25519)|.*\.pem|.*\.p12|.*\.pfx)$/i

const SECRET_TEMPLATE_BASENAME_PATTERN
  = /^\.env\.(?:example|sample|template|defaults?|dist)$/i

export interface SensitivePathMatcher {
  matches: (canonicalPath: string) => boolean
}

export interface CreateSensitivePathMatcherOptions {
  additionalRoots?: readonly string[]
  environment?: NodeJS.ProcessEnv
  home?: string
}

export function createSensitivePathMatcher(
  options: CreateSensitivePathMatcherOptions = {},
): SensitivePathMatcher {
  const home = options.home ?? safeHomedir()
  const environment = options.environment ?? process.env
  const roots = new Set<string>()

  for (const relative of HOME_RELATIVE_ROOTS) {
    if (home)
      roots.add(resolve(home, relative))
  }
  for (const root of ABSOLUTE_ROOTS)
    roots.add(resolve(root))
  for (const key of ENVIRONMENT_ROOT_KEYS) {
    const base = environment[key]
    if (!base || !isAbsolute(base))
      continue
    for (const relative of ENVIRONMENT_RELATIVE_ROOTS)
      roots.add(resolve(base, relative))
  }
  for (const root of options.additionalRoots ?? []) {
    if (isAbsolute(root))
      roots.add(resolve(root))
  }

  const sortedRoots = [...roots]

  return {
    matches(canonicalPath: string): boolean {
      if (!isAbsolute(canonicalPath))
        return false
      const name = basename(canonicalPath)
      if (SENSITIVE_BASENAME_PATTERN.test(name))
        return !SECRET_TEMPLATE_BASENAME_PATTERN.test(name)
      return sortedRoots.some(root => containsPath(root, canonicalPath))
    },
  }
}

function containsPath(root: string, path: string): boolean {
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`
  return path === root || path.startsWith(prefix)
}

function safeHomedir(): string | null {
  try {
    const home = homedir()
    return home && isAbsolute(home) ? home : null
  }
  catch {
    return null
  }
}
