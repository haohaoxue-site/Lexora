import type { SandboxRuntimeConfig } from '@anthropic-ai/sandbox-runtime'
import type { SandboxBackendInput } from '../../../shared/permissions/shellSandbox'
import { readdir } from 'node:fs/promises'
import { delimiter, join } from 'node:path'
import { containsCanonicalPath } from '../../../platform/filesystem/filePaths'
import { resolveSandboxDependencies } from '../../../platform/process/sandboxDependencies'
import { createSandboxFilesystemPolicy, existingSandboxPaths, SANDBOX_TOOLCHAIN_PATHS } from './sandboxFilesystemPolicy'

const SYSTEM_READ_PATHS = ['/usr', '/bin', '/sbin', '/lib', '/lib64', '/etc/ssl', '/etc/ca-certificates', '/etc/pki', '/etc/alternatives', '/etc/ld.so.cache', '/etc/ld.so.conf', '/etc/ld.so.conf.d', '/etc/localtime', '/etc/passwd', '/etc/group', '/etc/nsswitch.conf', '/etc/resolv.conf', '/etc/hosts', '/etc/services']

export async function createSandboxPolicy(input: SandboxBackendInput<'srt'>, signal: AbortSignal): Promise<{ config: SandboxRuntimeConfig, path: string }> {
  signal.throwIfAborted()
  const { bwrap, socat, rg, srtRoot, seccomp } = await resolveSandboxDependencies({ ...input.backend, searchDirectory: input.searchDirectory }, signal)
  const policy = await createSandboxFilesystemPolicy(input, rg, signal)
  const toolchains = await existingSandboxPaths(SANDBOX_TOOLCHAIN_PATHS.map(path => join(input.home, path)))
  const searchPaths = await existingSandboxPaths(input.path.split(delimiter).filter(path => path.startsWith('/')))
  const pathEntries = searchPaths.filter(path => [...toolchains, '/usr', '/bin'].some(root => containsCanonicalPath(root, path)))
  const runtimePaths = await existingSandboxPaths([...SYSTEM_READ_PATHS, ...toolchains, input.searchDirectory, join(srtRoot, 'vendor')])
  const paths = (access: typeof policy[number]['access']) => policy.filter(grant => grant.access === access).map(grant => grant.path)
  const readDenyRoots = (await readdir('/', { withFileTypes: true }))
    .filter(entry => !entry.isSymbolicLink() && !['proc', 'dev', 'sys'].includes(entry.name))
    .map(entry => `/${entry.name}`)
  return {
    path: [...new Set([...pathEntries, '/usr/local/bin', '/usr/bin', '/bin'])].join(delimiter),
    config: {
      bwrapPath: bwrap,
      socatPath: socat,
      seccomp: { applyPath: seccomp },
      ripgrep: { command: rg },
      filesystem: {
        denyRead: [...readDenyRoots, ...paths('denyRead')],
        allowRead: [...runtimePaths, ...paths('read'), ...paths('write'), input.privateRoot],
        allowWrite: [input.privateRoot, ...paths('write')],
        denyWrite: [...runtimePaths, input.backend.sandboxDirectory, srtRoot, ...paths('denyWrite'), ...policy.filter(grant => grant.access === 'denyRead' && !grant.exceptions.length).map(grant => grant.path), '/tmp/claude', '/private/tmp/claude'],
      },
      network: {
        allowedDomains: [],
        deniedDomains: [],
        deniedResolvedAddresses: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '100.64.0.0/10', 'fc00::/7'],
        allowAllUnixSockets: false,
        allowLocalBinding: false,
      },
    },
  }
}
