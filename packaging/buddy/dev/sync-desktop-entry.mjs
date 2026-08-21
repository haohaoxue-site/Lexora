import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'

import { writeOutput } from '../../shared/cli-output.mjs'

const repoRoot = resolve(import.meta.dirname, '../../..')
const buddyRoot = join(repoRoot, 'apps/buddy')
const buddyPackage = JSON.parse(readFileSync(join(buddyRoot, 'package.json'), 'utf8'))
const developmentDesktopName = `${buddyPackage.desktopName}.Development`

export function syncBuddyDevelopmentDesktopEntry(options = {}) {
  if ((options.platform ?? process.platform) !== 'linux')
    return null

  const dataHome = options.dataHome
    ?? process.env.XDG_DATA_HOME
    ?? join(homedir(), '.local', 'share')
  const applicationsDirectory = join(dataHome, 'applications')
  const entryPath = join(applicationsDirectory, `${developmentDesktopName}.desktop`)
  const content = createDesktopEntry()

  if (existsSync(entryPath) && readFileSync(entryPath, 'utf8') === content)
    return entryPath

  mkdirSync(applicationsDirectory, { recursive: true })
  writeFileSync(entryPath, content, { mode: 0o644 })
  refreshKdeServiceCache()
  return entryPath
}

function createDesktopEntry() {
  const iconPath = join(buddyRoot, 'resources/icons/app/256x256.png')
  const pnpmExecutable = process.env.npm_execpath
  const executable = pnpmExecutable && existsSync(pnpmExecutable)
    ? `${desktopExecArgument(process.execPath)} ${desktopExecArgument(realpathSync(pnpmExecutable))}`
    : 'pnpm'

  return [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    `Name=${buddyPackage.productName} Development`,
    `Exec=${executable} --dir ${desktopExecArgument(repoRoot)} dev:buddy`,
    `Icon=${iconPath}`,
    'Terminal=true',
    'NoDisplay=true',
    `StartupWMClass=${developmentDesktopName}`,
    '',
  ].join('\n')
}

function desktopExecArgument(value) {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('`', '\\`').replaceAll('$', '\\$')}"`
}

function refreshKdeServiceCache() {
  const result = spawnSync('kbuildsycoca6', ['--noincremental'], { stdio: 'ignore' })
  if (result.error?.code === 'ENOENT')
    return
  if (result.error)
    throw result.error
  if (result.status !== 0)
    throw new Error('Failed to refresh the KDE desktop service cache')
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const entryPath = syncBuddyDevelopmentDesktopEntry()
  if (entryPath)
    writeOutput(`Lexora Buddy development desktop entry ready: ${entryPath}`)
}
