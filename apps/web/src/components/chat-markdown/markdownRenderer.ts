import type MarkdownIt from 'markdown-it'
import type { Options as MarkdownItOptions } from 'markdown-it/lib/index.mjs'
import type Renderer from 'markdown-it/lib/renderer.mjs'
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs'
import type Token from 'markdown-it/lib/token.mjs'
import type { ChatMarkdownRenderOptions } from './typing'
import DOMPurify from 'dompurify'
import MarkdownItConstructor from 'markdown-it'
import { escapeHtml, highlightChatCode, resolveChatCodeLanguage } from './markdownCodeHighlight'
import { markdownMathPlugin } from './markdownMath'

const SAFE_LINK_PROTOCOL_PATTERN = /^(?:https?:|mailto:|\/|#)/i

export function renderChatMarkdown(source: string, options: ChatMarkdownRenderOptions = {}): string {
  const markdown = createMarkdownRenderer(options)
  return sanitizeChatMarkdownHtml(markdown.render(source))
}

export function renderStreamingCodeBlock(source: string): string {
  return sanitizeChatMarkdownHtml([
    '<pre class="chat-markdown__streaming-code"><code>',
    escapeHtml(source),
    '</code></pre>',
  ].join(''))
}

export function sanitizeChatMarkdownHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'rel', 'data-code', 'data-language'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'img'],
  })
}

function createMarkdownRenderer(options: ChatMarkdownRenderOptions): MarkdownIt {
  const markdown = new MarkdownItConstructor({
    html: false,
    linkify: true,
    breaks: false,
    highlight: (code, info) => {
      const language = resolveChatCodeLanguage(info)
      return highlightChatCode(code, language.highlightLanguage)
    },
  })

  markdown.validateLink = isSafeMarkdownLink
  markdown.use(markdownMathPlugin)
  markdown.core.ruler.after('inline', 'chat_task_list', transformTaskListItems)
  markdown.renderer.rules.link_open = renderLinkOpen()
  markdown.renderer.rules.fence = renderFence(options)
  markdown.renderer.rules.table_open = () => '<div class="chat-markdown__table-scroll"><table>\n'
  markdown.renderer.rules.table_close = () => '</table></div>\n'

  return markdown
}

function renderLinkOpen() {
  return (tokens: Token[], index: number, options: MarkdownItOptions, _env: unknown, self: Renderer) => {
    const token = tokens[index]
    token?.attrSet('target', '_blank')
    token?.attrSet('rel', 'noopener noreferrer')
    return self.renderToken(tokens, index, options)
  }
}

function renderFence(options: ChatMarkdownRenderOptions) {
  return (tokens: Token[], index: number) => {
    const token = tokens[index]
    const code = normalizeFenceCode(token?.content ?? '')
    const language = resolveChatCodeLanguage(token?.info ?? '')
    const dataCode = escapeHtml(encodeURIComponent(code))
    const disabled = options.isStreaming ? ' disabled aria-disabled="true"' : ''

    return [
      '<div class="chat-markdown__code-block" data-language="',
      escapeHtml(language.highlightLanguage),
      '">',
      '<div class="chat-markdown__code-header">',
      '<span class="chat-markdown__code-language">',
      escapeHtml(language.label),
      '</span>',
      '<button class="chat-markdown__code-copy" type="button" data-code="',
      dataCode,
      `"${disabled}>复制</button>`,
      '</div>',
      '<pre class="chat-markdown__code-pre"><code class="hljs language-',
      escapeHtml(language.highlightLanguage),
      '">',
      highlightChatCode(code, language.highlightLanguage),
      '</code></pre>',
      '</div>\n',
    ].join('')
  }
}

function normalizeFenceCode(code: string): string {
  return code.endsWith('\n') ? code.slice(0, -1) : code
}

function transformTaskListItems(state: StateCore): void {
  for (const token of state.tokens) {
    if (token.type !== 'inline' || !token.children?.length || !/^\[[ x]\]\s+/i.test(token.content)) {
      continue
    }

    const checked = /^\[x\]/i.test(token.content)
    token.content = token.content.replace(/^\[[ x]\]\s+/i, '')

    const firstText = token.children.find((child: Token) => child.type === 'text')
    if (firstText) {
      firstText.content = firstText.content.replace(/^\[[ x]\]\s+/i, '')
    }

    const checkbox = new state.Token('html_inline', '', 0)
    checkbox.content = `<input class="chat-markdown__task-checkbox" type="checkbox" disabled${checked ? ' checked' : ''}> `
    token.children.unshift(checkbox)
  }
}

function isSafeMarkdownLink(url: string): boolean {
  const normalized = url.trim()

  if (!normalized) {
    return false
  }

  return SAFE_LINK_PROTOCOL_PATTERN.test(normalized)
}
