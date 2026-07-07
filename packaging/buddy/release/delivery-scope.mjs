const deliverablePrefixes = [
  'apps/buddy/',
  'packaging/buddy/',
  'packaging/shared/',
]

const deliverableFiles = new Set([
  '.gitignore',
  '.node-version',
  '.github/workflows/buddy-aur-install.yml',
  '.github/workflows/buddy-linux-deb.yml',
  '.github/workflows/buddy-windows.yml',
  'eslint.config.js',
  'package.json',
  'pnpm-lock.yaml',
])

const forbiddenPrefixes = [
  'apps/buddy/dist/',
  'apps/buddy/node_modules/',
  'apps/buddy/src-tauri/gen/schemas/',
  'apps/buddy/src-tauri/target/',
  'todos/',
]

const forbiddenFiles = new Set([
  'packaging/buddy/external-readiness.evidence.json',
])

const forbiddenSegments = [
  '/__tests__/',
]

export function evaluateBuddyDeliveryScope(entries) {
  const errors = []
  const deliverablePaths = new Set()

  for (const entry of entries) {
    if (entry.status === '!!')
      continue

    if (isForbiddenPath(entry.path)) {
      errors.push(`${entry.path} must stay out of Buddy delivery`)
      continue
    }

    if (isDeliverablePath(entry.path))
      deliverablePaths.add(entry.path)
    else
      errors.push(`${entry.path} is not part of Buddy delivery scope`)
  }

  const sortedDeliverablePaths = [...deliverablePaths].sort()

  return {
    deliverableCount: sortedDeliverablePaths.length,
    deliverablePaths: sortedDeliverablePaths,
    errors,
  }
}

export function formatBuddyDeliveryScopeOutput(result, options = {}) {
  if (options.list)
    return result.deliverablePaths.join('\n')

  return `Buddy delivery scope check passed: ${result.deliverableCount} deliverable entries`
}

export function parseGitPorcelainStatus(output) {
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2).trim() || line.slice(0, 2)
      const rawPath = line.slice(3)
      const path = rawPath.includes(' -> ')
        ? rawPath.split(' -> ').at(-1)
        : rawPath

      return { path, status }
    })
}

function isDeliverablePath(path) {
  return deliverableFiles.has(path) || deliverablePrefixes.some(prefix => path.startsWith(prefix))
}

function isForbiddenPath(path) {
  return forbiddenFiles.has(path)
    || forbiddenPrefixes.some(prefix => path.startsWith(prefix))
    || forbiddenSegments.some(segment => path.includes(segment))
}
