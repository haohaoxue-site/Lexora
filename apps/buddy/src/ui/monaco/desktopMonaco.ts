import type * as Monaco from 'monaco-editor/editor/editor.api.js'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'

interface MonacoEnvironmentGlobal {
  MonacoEnvironment?: {
    getWorker: () => Worker
  }
}

let monacoPromise: Promise<typeof Monaco> | null = null

export function loadDesktopMonaco(): Promise<typeof Monaco> {
  if (!monacoPromise) {
    const global = globalThis as typeof globalThis & MonacoEnvironmentGlobal
    global.MonacoEnvironment = { getWorker: () => new EditorWorker() }
    const registrations = Promise.all([
      import('monaco-editor/features/codicon/register.js'),
      import('monaco-editor/languages/definitions/css/register.js'),
      import('monaco-editor/languages/definitions/html/register.js'),
      import('monaco-editor/languages/definitions/javascript/register.js'),
      import('monaco-editor/languages/definitions/markdown/register.js'),
      import('monaco-editor/languages/definitions/powershell/register.js'),
      import('monaco-editor/languages/definitions/python/register.js'),
      import('monaco-editor/languages/definitions/rust/register.js'),
      import('monaco-editor/languages/definitions/scss/register.js'),
      import('monaco-editor/languages/definitions/shell/register.js'),
      import('monaco-editor/languages/definitions/typescript/register.js'),
      import('monaco-editor/languages/definitions/xml/register.js'),
      import('monaco-editor/languages/definitions/yaml/register.js'),
    ])
    monacoPromise = Promise.all([
      import('monaco-editor/editor/editor.api.js'),
      registrations,
      import('monaco-editor/languages/definitions/powershell/powershell.js'),
      import('monaco-editor/languages/definitions/shell/shell.js'),
    ]).then(([monaco, , powershell, shell]) => {
      monaco.languages.setMonarchTokensProvider('powershell', powershell.language)
      monaco.languages.setMonarchTokensProvider('shell', shell.language)
      return monaco
    })
  }
  return monacoPromise
}

export function observeDesktopMonacoTheme(monaco: typeof Monaco): () => void {
  syncDesktopMonacoTheme(monaco)
  const observer = new MutationObserver(() => syncDesktopMonacoTheme(monaco))
  observer.observe(document.documentElement, {
    attributeFilter: ['data-buddy-theme'],
    attributes: true,
  })
  return () => observer.disconnect()
}

function syncDesktopMonacoTheme(monaco: typeof Monaco): void {
  monaco.editor.setTheme(
    document.documentElement.dataset.buddyTheme === 'dark' ? 'vs-dark' : 'vs',
  )
}
