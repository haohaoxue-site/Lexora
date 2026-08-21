const deliverablePrefixes = [
  'apps/buddy/',
  'packaging/buddy/',
  'packages/assets/',
]

const deliverableFiles = new Set([
  '.github/workflows/buddy-aur-install.yml',
  '.github/workflows/buddy-linux-deb.yml',
  '.github/workflows/buddy-windows.yml',
  '.gitignore',
  '.node-version',
  'eslint.config.js',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
])

const forbiddenPrefixes = [
  'apps/buddy/.output/',
  'apps/buddy/dist/',
  'apps/buddy/node_modules/',
  'apps/buddy/native-pet/target/',
  'packaging/buddy/external-readiness.evidence.json',
  'todos/',
]

export function evaluateBuddyDeliveryScope(entries) {
  const errors = []
  const deliverablePaths = new Set()
  for (const entry of entries) {
    if (entry.status === '!!')
      continue
    if (isForbiddenPath(entry.path))
      errors.push(`${entry.path} must stay out of Buddy delivery`)
    else if (isDeliverablePath(entry.path))
      deliverablePaths.add(entry.path)
    else
      errors.push(`${entry.path} is not part of Buddy delivery scope`)
  }

  const deliverablePathsSorted = [...deliverablePaths].sort()
  return {
    deliverableCount: deliverablePathsSorted.length,
    deliverablePaths: deliverablePathsSorted,
    errors,
  }
}

export function formatBuddyDeliveryScopeOutput(result, options = {}) {
  return options.list
    ? result.deliverablePaths.join('\n')
    : `Buddy delivery scope check passed: ${result.deliverableCount} deliverable entries`
}

export function parseGitPorcelainStatus(output) {
  return output.split('\n').filter(Boolean).map(line => ({
    path: line.slice(3).split(' -> ').at(-1),
    status: line.slice(0, 2).trim() || line.slice(0, 2),
  }))
}

function isDeliverablePath(path) {
  return deliverableFiles.has(path) || deliverablePrefixes.some(prefix => path.startsWith(prefix))
}

function isForbiddenPath(path) {
  return path.includes('/__tests__/') || forbiddenPrefixes.some(prefix => path.startsWith(prefix))
}
