import process from 'node:process'
import { runNativeCommand } from '../native/nativeCommand'
import { validateWindowsFilePath } from './filePath'

export async function ensureWindowsPrivateDirectories(paths: string[], executable?: string): Promise<void> {
  if (!executable)
    throw new Error('Windows private directory helper is unavailable')
  const result = await runNativeCommand(validateWindowsFilePath(executable), [], { paths: paths.map(validateWindowsFilePath) }, {
    env: { SystemRoot: process.env.SystemRoot },
    maxBytes: 1024,
  })
  if (result.code !== 0 || result.stdout.toString('utf8') !== '{"ok":true}')
    throw new Error('Buddy private storage requires directories accessible only to the current user and Windows administrators')
}
