import type { Context } from '@earendil-works/pi-ai'
import { describe, expect, it } from 'vitest'
import {
  createContextUsageBreakdown,
} from '../contextUsageBreakdown'

describe('createContextUsageBreakdown', () => {
  it('attributes the real request sources and keeps the provider total exact', async () => {
    const context: Context = {
      messages: [{
        content: '<skill name="review" location="/skills/review/SKILL.md">Follow the review contract.</skill>\n\nReview this change.',
        role: 'user',
        timestamp: Date.now(),
      }],
      systemPrompt: [
        'You are Lexora Buddy.',
        '',
        'The following skills provide specialized instructions for specific tasks.',
        '<available_skills>',
        '<skill>review</skill>',
        '</available_skills>',
        'Current working directory: /workspace',
      ].join('\n'),
      tools: [
        { description: 'Read files', name: 'read', parameters: { type: 'object' } as never },
        { description: 'Search issues', name: 'mcp__github__search', parameters: { type: 'object' } as never },
      ],
    }

    const usage = createContextUsageBreakdown(context, 1_000)

    expect(usage.systemPromptTokens).toBeGreaterThan(0)
    expect(usage.toolTokens).toBeGreaterThan(0)
    expect(usage.skillTokens).toBeGreaterThan(0)
    expect(usage.mcpTokens).toBeGreaterThan(0)
    expect(usage.messageTokens).toBeGreaterThan(0)
    expect(Object.values(usage).reduce((total, value) => total + value, 0)).toBe(1_000)
  })

  it('scales attributed sources without exceeding a small provider total', async () => {
    const usage = createContextUsageBreakdown({
      messages: [],
      systemPrompt: 'x'.repeat(4_000),
      tools: [{ description: 'y'.repeat(2_000), name: 'read', parameters: { type: 'object' } as never }],
    }, 100)

    expect(usage.messageTokens).toBe(0)
    expect(Object.values(usage).reduce((total, value) => total + value, 0)).toBe(100)
  })
})
