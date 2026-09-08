import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, parse, resolve } from 'node:path'
import process from 'node:process'
import { readBoundedFile } from '../boundedFile'
import { ensurePrivateDirectories } from '../privateDirectories'

assert.equal(process.platform, 'win32')
const [helperArgument, resultPath] = process.argv.slice(2)
assert.ok(helperArgument && resultPath)
const helper = resolve(helperArgument)
const directory = await mkdtemp(join(tmpdir(), 'buddy-private-contract-'))
const checks: string[] = []
const junctions: string[] = []

function inspect(path: string, sddl?: string): { sddl: string, owner: string, protected: boolean, user: string, allows: string[], inherited: boolean[] } {
  const script = `
$ErrorActionPreference='Stop'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$request=[Console]::In.ReadToEnd() | ConvertFrom-Json
$user=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
if($request.sddl){
  $security=[Security.AccessControl.DirectorySecurity]::new()
  $security.SetSecurityDescriptorSddlForm($request.sddl.Replace('CURRENT',$user),[Security.AccessControl.AccessControlSections]::Access)
  [IO.FileSystemAclExtensions]::SetAccessControl([IO.DirectoryInfo]::new($request.path),$security)
}
$acl=Get-Acl -LiteralPath $request.path
$rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]) | Where-Object AccessControlType -EQ 'Allow')
@{sddl=$acl.Sddl;owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value;protected=$acl.AreAccessRulesProtected;user=$user;allows=@($rules | ForEach-Object {$_.IdentityReference.Value});inherited=@($rules | ForEach-Object {$_.IsInherited})} | ConvertTo-Json -Compress
`
  return JSON.parse(execFileSync('C:\\Program Files\\PowerShell\\7\\pwsh.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-OutputFormat',
    'Text',
    '-EncodedCommand',
    Buffer.from(script, 'utf16le').toString('base64'),
  ], { input: JSON.stringify({ path, sddl }), encoding: 'utf8', windowsHide: true, timeout: 15_000 }))
}

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

  const insecure = join(directory, 'insecure')
  await ensurePrivateDirectories([insecure], helper)
  const broad = inspect(insecure, 'O:CURRENTD:P(A;OICI;FA;;;CURRENT)(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;FR;;;WD)')
  await assert.rejects(ensurePrivateDirectories([insecure], helper))
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

  await assert.rejects(ensurePrivateDirectories([file], helper))
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
