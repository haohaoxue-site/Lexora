import type { CreatePetToolOptions } from '../../pet/createPetTool'
import type { BuddyInProcessExtension } from '../createBuddyResourceLoader'

import { createPetTool } from '../../pet/createPetTool'

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
