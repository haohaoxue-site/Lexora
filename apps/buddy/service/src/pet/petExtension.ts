import type { BuddyCapability } from '../agent/extensions/BuddyCapability'
import type { BuddyInProcessExtension } from '../agent/extensions/BuddyInProcessExtension'

import type { CreatePetToolOptions } from './createPetTool'
import { createPetTool } from './createPetTool'
import { classifyPetTool } from './petToolContract'

export function createPetCapability(options: CreatePetToolOptions): BuddyCapability {
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
