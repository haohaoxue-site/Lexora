import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import nativeHost from '../../../apps/buddy/platform/nativeHost.json' with { type: 'json' }

const buddyRoot = fileURLToPath(new URL('../../../apps/buddy/', import.meta.url))

export function nativeHostResources(platform, architecture = 'x64') {
  return Object.values(nativeHost.components).flatMap((component) => {
    const target = component.targets[`${platform}-${architecture}`]
    return target
      ? [{
          from: `${nativeHost.directory}/${target.triple}/release/${target.executable}`,
          to: target.resource,
        }]
      : []
  })
}

export function prepareNativeHost() {
  if (!['linux', 'win32'].includes(process.platform) || process.arch !== 'x64')
    throw new Error(`Unsupported Buddy native target: ${process.platform}-${process.arch}`)
  for (const component of Object.values(nativeHost.components)) {
    const target = component.targets[`${process.platform}-${process.arch}`]
    if (!target)
      continue
    execFileSync('cargo', [
      'rustc',
      '--locked',
      '--release',
      '--target',
      target.triple,
      '--target-dir',
      nativeHost.directory,
      '--manifest-path',
      nativeHost.manifest,
      '--package',
      component.package,
      '--bin',
      component.binary,
      ...(process.platform === 'win32' ? ['--', '-C', 'target-feature=+crt-static'] : []),
    ], { cwd: buddyRoot, stdio: 'inherit' })
  }
}

export function verifyNativeHostFiles(readResource, platform) {
  for (const { to: path } of nativeHostResources(platform)) {
    assertNativeExecutable(readResource(path), platform, path)
  }
}

export function assertNativeExecutable(bytes, platform, path) {
  let valid = false
  if (platform === 'linux') {
    valid = bytes.length >= 20 && bytes.toString('hex', 0, 6) === '7f454c460201'
      && bytes.readUInt16LE(18) === 62
  }
  else if (platform === 'win32') {
    const offset = bytes.length >= 64 ? bytes.readUInt32LE(0x3C) : -1
    valid = bytes.toString('ascii', 0, 2) === 'MZ' && offset >= 0 && offset + 6 <= bytes.length
      && bytes.readUInt32LE(offset) === 0x4550 && bytes.readUInt16LE(offset + 4) === 0x8664
  }
  if (!valid)
    throw new Error(`Expected a ${platform} x64 native executable: ${path}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  prepareNativeHost()
