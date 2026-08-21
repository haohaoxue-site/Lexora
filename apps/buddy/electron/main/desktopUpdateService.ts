import type { DesktopUpdateCheckResult } from '../shared/desktopApi'

export interface CheckForDesktopUpdateOptions {
  currentVersion: string
  fetchRelease?: (url: string, init?: RequestInit) => Promise<Response>
}

interface GithubRelease {
  draft: boolean
  html_url: string
  prerelease: boolean
  tag_name: string
}

const LATEST_RELEASE_API_URL
  = 'https://api.github.com/repos/haohaoxue-site/Lexora/releases/latest'
const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/

export class DesktopUpdateCheckError extends Error {
  readonly code = 'UPDATE_CHECK_FAILED'

  constructor(options?: ErrorOptions) {
    super('Lexora Buddy update check failed', options)
    this.name = 'DesktopUpdateCheckError'
  }
}

export async function checkForDesktopUpdate(
  options: CheckForDesktopUpdateOptions,
): Promise<DesktopUpdateCheckResult> {
  try {
    const response = await (options.fetchRelease ?? fetch)(LATEST_RELEASE_API_URL, {
      headers: {
        'accept': 'application/vnd.github+json',
        'user-agent': 'Lexora-Buddy',
      },
    })
    if (!response.ok)
      throw new Error(`GitHub release request failed with ${response.status}`)

    const release = parseRelease(await response.json())
    const current = parseVersion(options.currentVersion)
    const latest = parseVersion(release.tag_name.slice(1))
    return {
      currentVersion: options.currentVersion,
      latestVersion: latest.raw,
      releaseUrl: release.html_url,
      status: compareVersions(latest.parts, current.parts) > 0
        ? 'update_available'
        : 'up_to_date',
    }
  }
  catch (error) {
    throw new DesktopUpdateCheckError({ cause: error })
  }
}

function parseRelease(value: unknown): GithubRelease {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('GitHub release response is invalid')
  const release = value as Partial<GithubRelease>
  if (
    release.draft !== false
    || release.prerelease !== false
    || typeof release.tag_name !== 'string'
    || !release.tag_name.startsWith('v')
    || typeof release.html_url !== 'string'
    || !isLexoraReleaseUrl(release.html_url)
  ) {
    throw new Error('GitHub release response is invalid')
  }
  return release as GithubRelease
}

function parseVersion(value: string): { parts: readonly number[], raw: string } {
  const match = SEMVER_PATTERN.exec(value)
  if (!match)
    throw new Error('Lexora Buddy version is invalid')
  return {
    parts: match.slice(1).map(Number),
    raw: value,
  }
}

function compareVersions(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = left[index]! - right[index]!
    if (difference !== 0)
      return difference
  }
  return 0
}

function isLexoraReleaseUrl(value: string): boolean {
  const url = new URL(value)
  return url.protocol === 'https:'
    && url.hostname === 'github.com'
    && url.pathname.startsWith('/haohaoxue-site/Lexora/releases/')
}
