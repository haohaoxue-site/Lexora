import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { access, mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, parse, resolve } from 'node:path'
import process from 'node:process'
import { PrivateDirectoryError } from '../../windows/privateDirectories'
import { readBoundedFile } from '../boundedFile'
import { ensurePrivateDirectories } from '../privateDirectories'
import { inspectWindowsPrivateDirectory as inspect } from './windowsPrivateDirectoryFixture'

assert.equal(process.platform, 'win32')
const [helperArgument, resultPath] = process.argv.slice(2)
assert.ok(helperArgument && resultPath)
const helper = resolve(helperArgument)
const directory = await mkdtemp(join(tmpdir(), 'buddy-private-contract-'))
const checks: string[] = []
const junctions: string[] = []

async function missing(path: string) {
  await assert.rejects(access(path), { code: 'ENOENT' })
}

try {
  const privatePath = join(directory, '示例', 'private')
  await ensurePrivateDirectories([privatePath], helper)
  await access(privatePath)
  const security = inspect(privatePath)
  assert.equal(security.owner, security.user)
  assert.equal(security.protected, true)
  assert.deepEqual(security.allows.sort(), [security.user, 'S-1-5-18', 'S-1-5-32-544'].sort())
  const file = join(privatePath, 'preserved.txt')
  await writeFile(file, 'fixture')
  const fileSecurity = inspect(file)
  assert.deepEqual(fileSecurity.allows.sort(), security.allows)
  assert.ok(fileSecurity.inherited.every(Boolean))
  await ensurePrivateDirectories([privatePath, privatePath], helper)
  await ensurePrivateDirectories([privatePath.toUpperCase()], helper)
  assert.equal(inspect(privatePath).sddl, security.sddl)
  assert.equal(await readFile(file, 'utf8'), 'fixture')
  checks.push('Unicode nested creation, protected private ACL, file inheritance and repeat startup')

  const inheritedParent = join(directory, 'creator-owner-parent')
  await mkdir(inheritedParent)
  const parentSecurity = inspect(inheritedParent, 'O:CURRENTD:P(A;OICI;FA;;;CURRENT)(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICIIO;FA;;;CO)')
  const inheritedDirectory = join(inheritedParent, 'existing', 'session-data')
  await mkdir(inheritedDirectory, { recursive: true })
  const inheritedSecurity = inspect(inheritedDirectory)
  assert.ok(inheritedSecurity.allows.includes('S-1-3-0'))
  const preserved = join(inheritedDirectory, 'preserved.txt')
  await writeFile(preserved, 'existing-user-data')
  await ensurePrivateDirectories([inheritedDirectory], helper)
  await ensurePrivateDirectories([inheritedDirectory], helper)
  assert.equal(inspect(inheritedParent).sddl, parentSecurity.sddl)
  assert.equal(inspect(inheritedDirectory).sddl, inheritedSecurity.sddl)
  assert.equal(await readFile(preserved, 'utf8'), 'existing-user-data')
  assert.ok(!inspect(preserved).allows.includes('S-1-3-0'))
  checks.push('existing inherited CREATOR OWNER templates are accepted without changing ACLs or data')

  for (const [name, grant] of [
    ['users-attributes', '(A;;0x80;;;BU)'],
    ['everyone-metadata', '(A;OICI;0x120080;;;WD)'],
    ['app-packages-metadata', '(A;OICIIO;0x120080;;;AC)'],
  ]) {
    const path = join(directory, name!)
    await ensurePrivateDirectories([path], helper)
    const before = inspect(path, `O:CURRENTD:P(A;OICI;FA;;;CURRENT)(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)${grant}`)
    const sentinel = join(path, 'preserved.txt')
    await writeFile(sentinel, 'existing-user-data')
    await ensurePrivateDirectories([path], helper)
    await ensurePrivateDirectories([path], helper)
    assert.equal(inspect(path).sddl, before.sddl)
    assert.equal(await readFile(sentinel, 'utf8'), 'existing-user-data')
  }
  checks.push('metadata-only grants are accepted without changing ACLs or existing files')

  const insecure = join(directory, 'insecure')
  await ensurePrivateDirectories([insecure], helper)
  const broad = inspect(insecure, 'O:CURRENTD:P(A;OICI;FA;;;CURRENT)(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;FR;;;WD)')
  await assert.rejects(ensurePrivateDirectories([insecure], helper), (error: unknown) => {
    assert.ok(error instanceof PrivateDirectoryError)
    assert.equal(error.code, 'PRIVATE_DIRECTORIES_UNSAFE')
    assert.deepEqual(error.failure, { kind: 'private_directories', operation: 'validate_acl', directoryIndex: 0, exitCode: 1 })
    return true
  })
  assert.equal(inspect(insecure).sddl, broad.sddl)
  const nullDacl = inspect(insecure, 'O:CURRENTD:NO_ACCESS_CONTROL')
  await assert.rejects(ensurePrivateDirectories([insecure], helper))
  assert.equal(inspect(insecure).sddl, nullDacl.sddl)
  checks.push('existing broad or NULL DACL is rejected without ACL repair')

  const target = join(directory, 'junction-target')
  const junction = join(directory, 'junction')
  await mkdir(target)
  const targetSecurity = inspect(target)
  await symlink(target, junction, 'junction')
  junctions.push(junction)
  await assert.rejects(ensurePrivateDirectories([junction], helper))
  await assert.rejects(ensurePrivateDirectories([join(junction, 'escaped')], helper))
  await missing(join(target, 'escaped'))
  assert.equal(inspect(target).sddl, targetSecurity.sddl)
  checks.push('leaf and ancestor junctions fail without touching the destination')

  await assert.rejects(ensurePrivateDirectories([file], helper), (error: unknown) => {
    assert.ok(error instanceof PrivateDirectoryError)
    assert.equal(error.code, 'PRIVATE_DIRECTORIES_FAILED')
    assert.equal(error.failure.operation, 'open_directory')
    assert.equal(error.failure.systemError?.domain, 'ntstatus')
    assert.equal(error.failure.directoryIndex, 0)
    return true
  })
  assert.equal(await readFile(file, 'utf8'), 'fixture')
  for (const forbidden of [homedir(), homedir().toUpperCase(), parse(directory).root, `${directory}\\bad:stream\\..\\escaped`, `${directory}\\NUL\\..\\escaped`])
    await assert.rejects(ensurePrivateDirectories([forbidden], helper))
  await missing(join(directory, 'escaped'))
  checks.push('files, user home, volume roots and raw stream/device aliases are rejected')

  const absentHelperTarget = join(directory, 'absent-helper')
  await assert.rejects(ensurePrivateDirectories([absentHelperTarget]))
  await missing(absentHelperTarget)
  await ensurePrivateDirectories([], helper)
  checks.push('missing helper fails closed and empty batches are a no-op')

  process.env.LEXORA_BUDDY_FILE_READER = join(dirname(helper), 'lexora-buddy-file-reader.exe')
  assert.equal((await readBoundedFile(privatePath, file)).toString(), 'fixture')
  await assert.rejects(readBoundedFile(privatePath, file, 1), { code: 'BOUNDED_FILE_OUTPUT_LIMIT' })
  checks.push('shared native path validation preserves bounded file reading')
}
finally {
  for (const junction of junctions)
    await unlink(junction)
  await rm(directory, { recursive: true })
}
const result = { passed: true, helperSha256: createHash('sha256').update(await readFile(helper)).digest('hex'), checks, fixturesRemoved: true }
await writeFile(resultPath, JSON.stringify(result, null, 2))
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
