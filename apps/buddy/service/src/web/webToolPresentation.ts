import type { BuddyToolPresentation } from '../../../shared/runEventPresentation'
import type { CreateBuddyToolPresentationInput } from '../events/toolPresentationSupport'
import { boundedToolPreview, readOptionalString, readRecord, readToolDetails, readToolOutput } from '../events/toolPresentationSupport'

export function createWebToolPresentation(input: CreateBuddyToolPresentationInput): BuddyToolPresentation | null {
  if (input.toolName !== 'lexora_web_search' && input.toolName !== 'lexora_web_fetch')
    return null
  const arguments_ = readRecord(input.arguments)
  return {
    card: 'web',
    operation: input.toolName === 'lexora_web_search' ? 'search' : 'fetch',
    target: (readOptionalString(arguments_, input.toolName === 'lexora_web_search' ? 'query' : 'url') ?? '').slice(0, 4096),
    provider: readOptionalString(readToolDetails(input.result), 'provider'),
    description: readOptionalString(arguments_, 'description'),
    ...boundedToolPreview(readToolOutput(input.result)),
  }
}
