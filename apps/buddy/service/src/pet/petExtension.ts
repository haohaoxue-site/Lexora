import type { BuddySessionCapability } from '../agent/BuddySessionCapability'
import type { BuddyInProcessExtension } from '../agent/createBuddyResourceLoader'

import type { CreatePetToolOptions } from './createPetTool'
import { createPetTool } from './createPetTool'
import { classifyPetTool } from './petToolContract'

export function createPetCapability(options: CreatePetToolOptions): BuddySessionCapability {
  return {
    extension: createPetExtension(options),
    classify: classifyPetTool,
  }
}

export function createPetExtension(
  options: CreatePetToolOptions,
): BuddyInProcessExtension {
  return {
    name: 'lexora-pet',
    factory(pi) {
      pi.registerTool(createPetTool(options))
    },
  }
}
