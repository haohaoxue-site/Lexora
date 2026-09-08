import { z } from 'zod'
import definitions from '../platform/definitions.json'

export const buddyFeatureIdSchema = z.enum(['nativePet', 'systemActions'])
export const buddyPlatformIdSchema = z.enum(['linux', 'win32'])
export const buddyCapabilitiesSchema = z.object({
  features: z.array(buddyFeatureIdSchema).readonly(),
  shell: z.enum(['bash', 'powershell']),
}).strict()

const platformSchema = buddyCapabilitiesSchema.extend({
  transport: z.enum(['unix', 'namedPipe']),
  builderPlatform: z.enum(['linux', 'win']),
  packageTargets: z.array(z.enum(['deb', 'pacman', 'nsis'])),
  environment: z.object({ caseSensitive: z.boolean(), names: z.array(z.string()) }).strict(),
}).strict()

const featureSchema = z.object({
  tools: z.array(z.string()),
  settingsCategory: z.literal('pet').nullable(),
  skills: z.array(z.string()),
  resources: z.array(z.object({ from: z.string(), to: z.string() }).strict()),
}).strict()

export type BuddyFeatureId = z.infer<typeof buddyFeatureIdSchema>
export type BuddyPlatformId = z.infer<typeof buddyPlatformIdSchema>
export type BuddyCapabilities = z.infer<typeof buddyCapabilitiesSchema>
export type BuddyPlatform = z.infer<typeof platformSchema> & { id: BuddyPlatformId }

export const BUDDY_FEATURES = z.record(buddyFeatureIdSchema, featureSchema).parse(definitions.features)
const platforms = z.record(buddyPlatformIdSchema, platformSchema).parse(definitions.platforms)

export function resolveBuddyPlatform(platform: string): BuddyPlatform {
  const id = buddyPlatformIdSchema.parse(platform)
  return { ...platforms[id], id }
}

export function supportsBuddyFeature(capabilities: BuddyCapabilities, feature: BuddyFeatureId): boolean {
  return capabilities.features.includes(feature)
}

export function describeBuddyCapabilities(platform: BuddyPlatform): BuddyCapabilities {
  return { features: [...platform.features], shell: platform.shell }
}
