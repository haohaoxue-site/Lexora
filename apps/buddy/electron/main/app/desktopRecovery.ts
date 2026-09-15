import { z } from 'zod'

const RECOVERY_ARGUMENT = '--lexora-recovery-from='

export function readPreviousLaunchId(argv: string[]): string | undefined {
  const value = argv.find(argument => argument.startsWith(RECOVERY_ARGUMENT))?.slice(RECOVERY_ARGUMENT.length)
  const parsed = z.uuid().safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function recoveryRelaunchArgs(argv: string[], launchId: string): string[] {
  return [...argv.slice(1).filter(argument => !argument.startsWith(RECOVERY_ARGUMENT)), `${RECOVERY_ARGUMENT}${z.uuid().parse(launchId)}`]
}
