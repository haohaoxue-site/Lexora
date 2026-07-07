import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { writeOutput } from '../../shared/cli-output.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../../..')
const iconName = 'lexora-buddy'
const desktopIds = ['lexora-buddy', 'com.lexora.buddy']

export function resolveLexoraBuddyDevDesktopIdentityPaths(options = {}) {
  const dataHome = resolve(options.dataHome ?? process.env.XDG_DATA_HOME ?? join(homedir(), '.local/share'))
  const execPath = resolve(options.execPath ?? join(repoRoot, 'apps/buddy/src-tauri/target/debug/lexora-buddy'))
  const desktopEntries = desktopIds.map(desktopId => ({
    id: desktopId,
    path: join(dataHome, 'applications', `${desktopId}.desktop`),
  }))

  return {
    dataHome,
    desktopPath: desktopEntries[0].path,
    desktopEntries,
    execPath,
    icons: [
      {
        source: join(repoRoot, 'apps/buddy/src-tauri/icons/32x32.png'),
        target: join(dataHome, 'icons/hicolor/32x32/apps', `${iconName}.png`),
      },
      {
        source: join(repoRoot, 'apps/buddy/src-tauri/icons/128x128.png'),
        target: join(dataHome, 'icons/hicolor/128x128/apps', `${iconName}.png`),
      },
      {
        source: join(repoRoot, 'apps/buddy/src-tauri/icons/icon.png'),
        target: join(dataHome, 'icons/hicolor/256x256/apps', `${iconName}.png`),
      },
    ],
  }
}

export function createLexoraBuddyDevDesktopEntry(options = {}) {
  const execPath = escapeDesktopExecPath(options.execPath ?? join(repoRoot, 'apps/buddy/src-tauri/target/debug/lexora-buddy'))
  const desktopId = options.desktopId ?? desktopIds[0]

  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Lexora Buddy',
    'Comment=Lexora Buddy desktop agent bridge',
    `Exec=${execPath}`,
    `Icon=${iconName}`,
    'Terminal=false',
    'NoDisplay=true',
    'Categories=Utility;',
    'StartupNotify=false',
    `StartupWMClass=${desktopId}`,
    '',
  ].join('\n')
}

export function installLexoraBuddyDevDesktopIdentity(options = {}) {
  const paths = resolveLexoraBuddyDevDesktopIdentityPaths(options)

  for (const entry of paths.desktopEntries) {
    mkdirSync(dirname(entry.path), { recursive: true })
    writeFileSync(
      entry.path,
      createLexoraBuddyDevDesktopEntry({ desktopId: entry.id, execPath: paths.execPath }),
    )
  }

  for (const icon of paths.icons) {
    mkdirSync(dirname(icon.target), { recursive: true })
    copyFileSync(icon.source, icon.target)
  }

  refreshDesktopCaches(paths.dataHome, options)

  return paths
}

function refreshDesktopCaches(dataHome, options = {}) {
  const run = options.run ?? runOptionalCommand

  run('gtk-update-icon-cache', ['-f', '-t', join(dataHome, 'icons/hicolor')])
  run('kbuildsycoca6', ['--noincremental'])
}

function runOptionalCommand(command, args) {
  spawnSync(command, args, { stdio: 'ignore' })
}

function escapeDesktopExecPath(path) {
  return path.replaceAll('\\', '\\\\').replaceAll(' ', '\\ ')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = installLexoraBuddyDevDesktopIdentity()
  writeOutput(`Lexora Buddy dev desktop identity installed: ${paths.desktopPath}`)
}
