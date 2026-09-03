import type { BuddyInProcessExtension } from '../createBuddyResourceLoader'

export function createSystemPromptExtension(): BuddyInProcessExtension {
  return {
    name: 'lexora-system-prompt',
    factory(pi) {
      pi.on('before_agent_start', event => ({
        systemPrompt: buildBuddyRuntimeSystemPrompt({
          basePrompt: event.systemPrompt,
          promptGuidelines: event.systemPromptOptions.promptGuidelines ?? [],
        }),
      }))
    },
  }
}

export function buildBuddyRuntimeSystemPrompt(input: {
  basePrompt: string
  promptGuidelines: readonly string[]
}): string {
  const guidelines = [...new Set(input.promptGuidelines.map(value => value.trim()).filter(Boolean))]
  const sections = [input.basePrompt]
  if (guidelines.length > 0) {
    sections.push([
      'Active tool guidelines:',
      ...guidelines.map(guideline => `- ${guideline}`),
    ].join('\n'))
  }
  return sections.join('\n\n')
}
