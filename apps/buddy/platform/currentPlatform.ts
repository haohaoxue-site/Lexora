import process from 'node:process'
import { resolveBuddyPlatform } from '../shared/platform'

export const currentPlatform = resolveBuddyPlatform(process.platform)
