import { describe, expect, it } from 'vitest'
import { conversationTreePreview } from '../conversationTreePreview'

describe('conversation overview text', () => {
  it('bounds completed prefixes and streaming tails before rendering', () => {
    const text = `**Opening**\n\n${'content '.repeat(20000)}\n**Latest output**`
    const completed = conversationTreePreview(text)
    const streaming = conversationTreePreview(text, true)
    expect(completed.length).toBeLessThanOrEqual(240)
    expect(completed).toMatch(/^Opening/)
    expect(completed).not.toContain('Latest output')
    expect(streaming.length).toBeLessThanOrEqual(640)
    expect(streaming).toMatch(/Latest output$/)
    expect(streaming).not.toContain('Opening')
  })

  it('renders a plain excerpt without Markdown formatting or empty placeholders', () => {
    expect(conversationTreePreview('## Overview\n- **180–210 km** via [route](https://example.test)\n```ts\nconst a = 1\n```')).toBe('Overview\n180–210 km via route\nconst a = 1')
    expect(conversationTreePreview('')).toBe('')
  })
})
