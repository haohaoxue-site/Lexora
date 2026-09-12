import type { SandboxDirectoryGrant } from '../../../shared/permissions/shellSandbox'
import type { BuddyExtensionRunContext } from '../agent/extensions/BuddyExtensionRunContext'
import type { DirectoryGrant } from '../directories/resolveGrantedPath'
import { realpath, stat } from 'node:fs/promises'
import { ShellSandboxError } from '../../../shared/permissions/shellSandbox'

export class SandboxDirectoryPermissions {
  readonly #runs = new WeakMap<BuddyExtensionRunContext, Map<string, SandboxDirectoryGrant>>()

  async grant(run: BuddyExtensionRunContext, grant: SandboxDirectoryGrant): Promise<void> {
    run.signal.throwIfAborted()
    await validateSandboxDirectory(grant)
    run.signal.throwIfAborted()
    let grants = this.#runs.get(run)
    if (!grants) {
      grants = new Map()
      this.#runs.set(run, grants)
      run.signal.addEventListener('abort', () => this.#runs.delete(run), { once: true })
    }
    const existing = grants.get(grant.path)
    if (existing?.access !== 'write' || existing.device !== grant.device || existing.inode !== grant.inode)
      grants.set(grant.path, { access: grant.access, path: grant.path, device: grant.device, inode: grant.inode })
  }

  get(run: BuddyExtensionRunContext | null): SandboxDirectoryGrant[] {
    return run && !run.signal.aborted ? [...this.#runs.get(run)?.values() ?? []] : []
  }

  getWriteGrants(run: BuddyExtensionRunContext | null): DirectoryGrant[] {
    return this.get(run).filter(grant => grant.access === 'write').map(grant => ({
      canonicalRoot: grant.path,
      grantId: `sandbox:${grant.path}`,
      kind: 'granted',
      root: grant.path,
    }))
  }
}

export async function validateSandboxDirectory(grant: SandboxDirectoryGrant): Promise<void> {
  try {
    const canonical = await realpath(grant.path)
    const metadata = await stat(canonical, { bigint: true })
    if (canonical === grant.path && metadata.isDirectory() && String(metadata.dev) === grant.device && String(metadata.ino) === grant.inode)
      return
  }
  catch {}
  throw new ShellSandboxError('SANDBOX_DIRECTORY_CHANGED')
}
