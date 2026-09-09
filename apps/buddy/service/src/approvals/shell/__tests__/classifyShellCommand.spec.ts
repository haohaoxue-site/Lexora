import { describe, expect, it } from 'vitest'
import { classifyShellCommand } from '../classifyShellCommand'

describe('shell query classification', () => {
  it('recognizes literal Git inspections and preserves their file targets', () => {
    for (const command of [
      'git status',
      'git status --short && git diff --check',
      'git diff --cached --stat',
      'git diff',
      'git diff --stat --patch',
      'git --no-pager log --oneline -10',
      'git ls-files --error-unmatch -- package.json',
      'git check-ignore -v -- dist || true',
      'git diff -- src/index.ts',
      'git diff --cached HEAD~1 -- "src/file name.ts"',
    ]) {
      expect(classifyShellCommand('bash', command, 'linux'), command).toMatchObject({ git: true, type: 'auto-approve' })
    }
    expect(classifyShellCommand('bash', 'git diff -- src/index.ts', 'linux')).toEqual({
      git: true,
      gitDiffs: [['--', 'src/index.ts']],
      readPaths: ['.', 'src/index.ts'],
      type: 'auto-approve',
    })
    expect(classifyShellCommand('powershell', 'git.exe status --short | Out-String', 'win32')).toMatchObject({ git: true, type: 'auto-approve' })
  })

  it('does not grant the Git executable or guess unsafe options and shell syntax', () => {
    for (const command of [
      'git add .',
      'git reset --hard',
      'git push',
      'git clean -fd',
      'git status && git reset --hard',
      'git status || python transform.py',
      'git -c core.fsmonitor=hook status',
      'git --config-env=core.fsmonitor=HOOK status',
      'git -C /tmp status',
      'git --git-dir=/tmp/repository status',
      'git --paginate status',
      'git diff --output=review.txt --check',
      'git diff --output review.txt --check',
      'git diff --ext-diff --check',
      'git diff --textconv --check',
      'git diff --no-index a b',
      'git log --show-signature',
      'git log -p',
      'git show HEAD:.env',
      'git diff -- "*.env"',
      'git diff -- ../secret',
      'git diff -- /tmp/secret',
      'git diff -- ":(top)*"',
      'git diff -- --stat .',
      'git diff --check > report.txt',
      'git status; $(touch marker)',
      'git status `touch marker`',
      'git status\ngit reset --hard',
      'GIT_EXTERNAL_DIFF=hook git diff --check',
    ]) {
      expect(classifyShellCommand('bash', command, 'linux'), command).toMatchObject({ type: 'approval-required' })
    }
    expect(classifyShellCommand('powershell', 'git status; Remove-Item file', 'win32')).toMatchObject({ type: 'approval-required' })
  })

  it('tracks literal file query paths without granting arbitrary interpreter execution', () => {
    expect(classifyShellCommand('bash', 'ls -la src && cat -- package.json | wc -l', 'linux')).toEqual({
      readPaths: ['src', 'package.json'],
      type: 'auto-approve',
    })
    expect(classifyShellCommand('bash', 'cat "/tmp/file with spaces"', 'linux')).toMatchObject({ readPaths: ['/tmp/file with spaces'] })
    expect(classifyShellCommand('bash', 'node --version', 'linux')).toEqual({ type: 'auto-approve' })
    for (const command of ['node -e "process.exit()"', 'cat file > copy', 'ls --unknown', 'cat "$SECRET"']) {
      expect(classifyShellCommand('bash', command, 'linux'), command).toMatchObject({ type: 'approval-required' })
    }
    expect(classifyShellCommand('bash', 'python script.py', 'linux')).toEqual({ type: 'approval-required', reason: 'unknown-command' })
  })
})
