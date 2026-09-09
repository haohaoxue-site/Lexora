// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { findChatQuoteTextRanges, readChatQuoteTextOffset } from '../chatQuoteText'

const body = document.createElement('div')
afterEach(() => {
  body.replaceChildren()
  body.remove()
  window.getSelection()?.removeAllRanges()
})

function render(html: string) {
  body.innerHTML = html
  document.body.append(body)
  return body
}

function texts(quote: { text: string, textOffset?: number }) {
  return findChatQuoteTextRanges(body, quote).map(range => range.toString())
}

describe('quote text ranges', () => {
  it('targets a substring across formatting without changing the DOM or the reader selection', () => {
    render('<p>Before <strong>important</strong> quoted <em>text</em> after.</p>')
    const range = document.createRange()
    range.selectNodeContents(body.querySelector('em')!)
    window.getSelection()!.addRange(range)
    const html = body.innerHTML
    expect(texts({ text: 'important quoted text' })).toEqual(['important', ' quoted ', 'text'])
    expect(body.innerHTML).toBe(html)
    expect(window.getSelection()!.toString()).toBe('text')
  })

  it('matches code and paragraph boundaries without highlighting headers, line numbers or controls', () => {
    render('<p>Settings</p><div class="code-block-header">YAML<button>Copy</button></div><div class="line-numbers">1 2</div><pre><span>    enabled: </span><span>true</span>\n<span>    mode: safe</span></pre><p hidden>Hidden</p><p>Done</p>')
    expect(texts({ text: 'Settings\n\n    enabled: true\n    mode: safe\nDone' })).toEqual(['Settings', '    enabled: ', 'true', '    mode: safe', 'Done'])
    expect(texts({ text: 'YAML' })).toEqual([])
    expect(texts({ text: '1 2' })).toEqual([])
    expect(texts({ text: 'Hidden' })).toEqual([])
  })

  it('uses the captured position for repeated text and does not guess for ambiguous legacy quotes', () => {
    render('<p>Repeat this.</p><p>Repeat this.</p>')
    const second = body.lastElementChild!.firstChild!
    const selection = document.createRange()
    selection.setStart(second, 0)
    selection.setEnd(second, 6)
    const textOffset = readChatQuoteTextOffset(body, selection)
    const ranges = findChatQuoteTextRanges(body, { text: 'Repeat', textOffset })
    expect(textOffset).toBe('Repeatthis.'.length)
    expect(ranges).toHaveLength(1)
    expect(ranges[0]!.startContainer).toBe(second)
    expect(ranges[0]!.startOffset).toBe(0)
    expect(ranges[0]!.endOffset).toBe(6)
    expect(texts({ text: 'Repeat' })).toEqual([])
  })

  it('recovers a unique shifted passage and leaves changed or blank content unhighlighted', () => {
    render('<p>New prefix, original passage, new suffix.</p>')
    expect(texts({ text: 'original passage', textOffset: 0 })).toEqual(['original passage'])
    expect(texts({ text: 'removed passage' })).toEqual([])
    expect(texts({ text: ' \n ' })).toEqual([])
  })
})
