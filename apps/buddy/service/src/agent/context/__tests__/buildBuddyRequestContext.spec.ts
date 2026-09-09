import { Type } from 'typebox'
import { describe, expect, it } from 'vitest'
import { buildBuddyRequestContext } from '../buildBuddyRequestContext'

describe('buildBuddyRequestContext', () => {
  it('includes only active first-party guidelines once and does not promote MCP metadata into instructions', () => {
    const tools = ['lexora_visible', 'lexora_hidden', 'mcp__service__action'].map(name => ({ name, description: name, parameters: Type.Object({}), sourceInfo: { source: 'extension', path: '', origin: 'top-level' as const, scope: 'temporary' as const }, promptGuidelines: [`GUIDELINE_${name}`, `GUIDELINE_${name}`] }))
    const context = buildBuddyRequestContext({ systemPrompt: 'Buddy base prompt', messages: [], tools: [tools[0]!, tools[2]!] }, tools)
    expect(context.systemPrompt?.match(/GUIDELINE_lexora_visible/g)).toHaveLength(1)
    expect(context.systemPrompt).not.toContain('GUIDELINE_lexora_hidden')
    expect(context.systemPrompt).not.toContain('GUIDELINE_mcp__')
    expect(context.tools).toEqual([tools[0], tools[2]])
  })
})
