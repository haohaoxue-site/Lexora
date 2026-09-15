export function composerReferencePath(path: string, workingDirectory?: string): string {
  if (!workingDirectory)
    return path
  const windows = /^[a-z]:[\\/]|^\\\\/iu.test(workingDirectory)
  const root = (windows ? workingDirectory.replaceAll('\\', '/') : workingDirectory).replace(/\/+$/u, '')
  const candidate = windows ? path.replaceAll('\\', '/') : path
  const key = windows ? candidate.toLocaleLowerCase() : candidate
  const rootKey = windows ? root.toLocaleLowerCase() : root
  if (key.replace(/\/+$/u, '') === rootKey)
    return '.'
  return key.startsWith(`${rootKey}/`) ? candidate.slice(root.length + 1) : path
}

export function composerPathSeparator(path: string): string {
  return /^(?:[a-z]:\\|\\\\)/iu.test(path) ? '\\' : '/'
}
