import { join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '../../..')

export function resolveBuddyOutputPaths(cwd = repoRoot) {
  const buddyRoot = join(cwd, 'apps/buddy')
  const outputRoot = join(buddyRoot, '.output')

  return {
    artifacts: {
      desktop: join(outputRoot, 'artifacts/desktop'),
      pet: join(outputRoot, 'artifacts/pet'),
    },
    buddyRoot,
    build: {
      electron: join(outputRoot, 'build/electron'),
      nativePet: join(outputRoot, 'build/native-pet'),
    },
    outputRoot,
    package: {
      desktop: join(outputRoot, 'package/desktop'),
      pet: join(outputRoot, 'package/pet'),
    },
  }
}
