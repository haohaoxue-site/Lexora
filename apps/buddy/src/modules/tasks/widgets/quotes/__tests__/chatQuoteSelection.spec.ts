// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { readChatQuoteSelection } from '../chatQuoteSelection'

const root = document.createElement('div')
afterEach(() => {
  window.getSelection()?.removeAllRanges()
  root.replaceChildren()
  root.remove()
})

function message(text: string) {
  document.body.append(root)
  const host = document.createElement('div')
  host.dataset.quoteSource = JSON.stringify({ conversationId: 'conversation-1', branchId: 'branch-1', messageId: 'message-1', role: 'assistant', runId: 'run-1' })
  const body = document.createElement('pre')
  body.className = 'buddy-chat-message-content__text'
  body.textContent = text
  host.append(body)
  root.append(host)
  return body
}

function select(start: Node, end = start) {
  const range = document.createRange()
  range.setStart(start, 0)
  range.setEnd(end, end.textContent!.length)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  return selection
}

describe('chat quote selection', () => {
  it('captures an immutable snapshot of a single message, preserving indentation and trailing newlines', () => {
    const body = message('    enabled: true\n\n')
    const result = readChatQuoteSelection(root, select(body.firstChild!))!
    expect(result.quote.text).toBe('    enabled: true\n\n')
    body.textContent = 'streamed replacement'
    expect(result.quote.text).toBe('    enabled: true\n\n')
    expect(result.quote.source.messageId).toBe('message-1')
  })

  it('rejects cross-message, empty, excluded and outside selections', () => {
    const first = message('First')
    const second = message('Second')
    expect(readChatQuoteSelection(root, select(first.firstChild!, second.firstChild!))).toBeNull()
    const button = document.createElement('button')
    button.textContent = 'Copy'
    first.append(button)
    expect(readChatQuoteSelection(root, select(button.firstChild!))).toBeNull()
    expect(readChatQuoteSelection(document.createElement('div'), select(first.firstChild!))).toBeNull()
    window.getSelection()!.removeAllRanges()
    expect(readChatQuoteSelection(root, window.getSelection())).toBeNull()
  })
})
