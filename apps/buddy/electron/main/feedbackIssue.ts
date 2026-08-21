const FEEDBACK_ISSUE_URL = 'https://github.com/haohaoxue-site/Lexora/issues/new'

export function createFeedbackIssueUrl(feedback: string): string {
  const body = feedback.trim()
  if (!body)
    return FEEDBACK_ISSUE_URL
  const url = new URL(FEEDBACK_ISSUE_URL)
  url.searchParams.set('body', body)
  return url.toString()
}
