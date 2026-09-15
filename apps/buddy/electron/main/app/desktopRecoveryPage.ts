import type { MessageBoxOptions } from 'electron'

export type RecoveryAction = 'retry' | 'open_logs' | 'show_directory' | 'quit'

const actionOrigin = 'https://lexora-recovery.invalid/'
const actions: RecoveryAction[] = ['retry', 'open_logs', 'show_directory', 'quit']

export function readRecoveryAction(url: string): RecoveryAction | undefined {
  return actions.find(action => url === `${actionOrigin}${action}`)
}

export function recoveryPage(options: MessageBoxOptions, hasDirectory: boolean, status = ''): string {
  const visibleActions = actions.filter(action => action !== 'show_directory' || hasDirectory)
  const buttons = visibleActions.map((action, index) => `<a role="button" data-action="${action}" href="${actionOrigin}${action}"${index === 0 ? ' autofocus' : ''}>${escapeHtml(options.buttons?.[index] ?? action)}</a>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(options.title ?? 'Lexora Buddy')}</title><style>
    :root { color-scheme: light dark; font: 14px/1.65 system-ui, sans-serif; color: #242424; background: #fafafa; }
    * { box-sizing: border-box; } body { margin: 0; padding: 30px; } main { max-width: 680px; margin: auto; }
    .brand { font-size: 12px; color: #747474; letter-spacing: .08em; } h1 { font-size: 23px; font-weight: 600; line-height: 1.4; margin: 12px 0 20px; }
    .detail { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; } #status { color: #99571c; min-height: 24px; margin: 18px 0; }
    nav { display: flex; gap: 10px; flex-wrap: wrap; } a { text-decoration: none; color: inherit; background: #fff; border: 1px solid #ccc; border-radius: 6px; padding: 8px 14px; }
    a:first-child { background: #242424; color: #fff; border-color: #242424; } a:hover { filter: brightness(.9); } a:focus-visible { outline: 2px solid #4278d5; outline-offset: 3px; }
    [aria-busy="true"] nav { opacity: .5; pointer-events: none; }
    @media (prefers-color-scheme: dark) { :root { color: #eee; background: #222; } .brand { color: #aaa; } a { background: #292929; border-color: #555; } a:first-child { background: #eee; color: #222; border-color: #eee; } #status { color: #edb878; } }
  </style></head><body><main><div class="brand">LEXORA BUDDY</div><h1>${escapeHtml(options.message)}</h1><p class="detail">${escapeHtml(options.detail ?? '')}</p><p id="status" role="status" aria-live="polite">${escapeHtml(status)}</p><nav>${buttons}</nav></main></body></html>`
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll('\'', '&#39;')
}
