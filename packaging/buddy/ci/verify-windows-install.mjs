import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'
import { writeError, writeOutput } from '../../shared/cli-output.mjs'
import { resolveBuddyOutputPaths } from '../release/output-paths.mjs'
import { verifyDesktopDirectory } from '../release/verify-package.mjs'
import { runDesktopSmoke } from './run-gui-smoke.mjs'

async function main() {
  if (process.platform !== 'win32' || process.arch !== 'x64')
    throw new Error('Installed Windows smoke requires Windows x64')
  const directory = process.argv[2]
  if (process.argv.length !== 3 || !directory || !isAbsolute(directory))
    throw new Error('Usage: verify-windows-install.mjs <absolute-installed-directory>')
  const packageRoot = resolveBuddyOutputPaths().package.desktop
  if (resolve(directory).toLowerCase().startsWith(`${packageRoot.toLowerCase()}\\`))
    throw new Error('Install the NSIS package before running installed smoke')

  const { executablePath, version } = verifyDesktopDirectory(directory, 'win32')
  if (!existsSync(join(directory, 'Uninstall Lexora Buddy.exe')))
    throw new Error('NSIS uninstall entry is missing from the installed directory')
  const smokeRoot = await mkdtemp(join(tmpdir(), 'lexora-windows-smoke-'))
  try {
    const lexoraHome = join(smokeRoot, '用户 Data')
    const environment = {
      ...process.env,
      LEXORA_HOME: lexoraHome,
    }
    delete environment.ELECTRON_RUN_AS_NODE
    await runDesktopSmoke(executablePath, environment, 45_000)
    const database = new DatabaseSync(join(lexoraHome, 'buddy', 'buddy.sqlite3'))
    try {
      const integrity = database.prepare('PRAGMA quick_check').get()
      if (integrity?.quick_check !== 'ok')
        throw new Error('Installed Windows database integrity check failed')
      const schema = database.prepare('PRAGMA user_version').get()
      if (!(Number(schema?.user_version) > 0))
        throw new Error('Installed Windows runtime did not initialize its database')
    }
    finally {
      database.close()
    }
    await runDesktopSmoke(executablePath, environment, 45_000)
    writeOutput(`Installed Windows Desktop ${version}: startup, database, restart and shutdown passed`)
  }
  finally {
    await rm(smokeRoot, { force: true, recursive: true })
  }
}

void main().catch((error) => {
  writeError(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
