import { describe, expect, it } from 'vitest'
import { createFeedbackIssueUrl } from '../feedbackIssue'

describe('createFeedbackIssueUrl', () => {
  it('opens a public Issue with only the feedback text prefilled', () => {
    const url = new URL(createFeedbackIssueUrl('  希望通知支持更多设置。  '))

    expect(url.origin).toBe('https://github.com')
    expect(url.pathname).toBe('/haohaoxue-site/Lexora/issues/new')
    expect(url.searchParams.get('body')).toBe('希望通知支持更多设置。')
    expect(url.searchParams.has('logs')).toBe(false)
    expect(url.searchParams.has('environment')).toBe(false)
  })
})
