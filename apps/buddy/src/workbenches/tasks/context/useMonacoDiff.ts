import type * as Monaco from 'monaco-editor/editor/editor.api.js'
import type { Ref } from 'vue'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import { onBeforeUnmount, shallowRef, watch } from 'vue'

interface MonacoEnvironmentGlobal {
  MonacoEnvironment?: {
    getWorker: () => Worker
  }
}

interface UseMonacoDiffOptions {
  container: Readonly<Ref<HTMLElement | null>>
  language: Readonly<Ref<string | null>>
  modified: Readonly<Ref<string>>
  original: Readonly<Ref<string>>
  path: Readonly<Ref<string>>
}

let monacoPromise: Promise<typeof Monaco> | null = null

export function useMonacoDiff(options: UseMonacoDiffOptions) {
  const loading = shallowRef(true)
  const failed = shallowRef(false)
  let editor: Monaco.editor.IStandaloneDiffEditor | null = null
  let originalModel: Monaco.editor.ITextModel | null = null
  let modifiedModel: Monaco.editor.ITextModel | null = null
  let themeObserver: MutationObserver | null = null
  let generation = 0

  const stopContainerWatch = watch(options.container, async (container) => {
    disposeEditor()
    failed.value = false
    loading.value = true
    if (!container)
      return
    const currentGeneration = ++generation
    try {
      const monaco = await loadMonaco()
      if (currentGeneration !== generation || options.container.value !== container)
        return
      const modelId = crypto.randomUUID()
      const language = options.language.value ?? 'plaintext'
      originalModel = monaco.editor.createModel(
        options.original.value,
        language,
        monaco.Uri.parse(`inmemory://lexora-buddy/${modelId}/before/${options.path.value}`),
      )
      modifiedModel = monaco.editor.createModel(
        options.modified.value,
        language,
        monaco.Uri.parse(`inmemory://lexora-buddy/${modelId}/after/${options.path.value}`),
      )
      editor = monaco.editor.createDiffEditor(container, {
        automaticLayout: true,
        contextmenu: false,
        diffCodeLens: false,
        domReadOnly: true,
        enableSplitViewResizing: true,
        fontSize: 12,
        hideUnchangedRegions: {
          contextLineCount: 3,
          enabled: true,
          minimumLineCount: 8,
          revealLineCount: 12,
        },
        lineHeight: 20,
        minimap: { enabled: false },
        originalEditable: false,
        overviewRulerLanes: 0,
        padding: { bottom: 16, top: 12 },
        readOnly: true,
        renderMarginRevertIcon: false,
        renderOverviewRuler: false,
        renderSideBySide: true,
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        stickyScroll: { enabled: false },
      })
      editor.setModel({ modified: modifiedModel, original: originalModel })
      syncTheme(monaco)
      themeObserver = new MutationObserver(() => syncTheme(monaco))
      themeObserver.observe(document.documentElement, {
        attributeFilter: ['data-buddy-theme'],
        attributes: true,
      })
      loading.value = false
    }
    catch {
      if (currentGeneration === generation) {
        failed.value = true
        loading.value = false
      }
    }
  }, { immediate: true })

  const stopModelWatch = watch(
    [options.original, options.modified, options.language],
    ([original, modified, language]) => {
      if (!originalModel || !modifiedModel)
        return
      originalModel.setValue(original)
      modifiedModel.setValue(modified)
      void loadMonaco().then((monaco) => {
        if (!originalModel || !modifiedModel)
          return
        monaco.editor.setModelLanguage(originalModel, language ?? 'plaintext')
        monaco.editor.setModelLanguage(modifiedModel, language ?? 'plaintext')
      })
    },
  )

  function disposeEditor() {
    generation += 1
    themeObserver?.disconnect()
    themeObserver = null
    editor?.dispose()
    editor = null
    originalModel?.dispose()
    originalModel = null
    modifiedModel?.dispose()
    modifiedModel = null
  }

  onBeforeUnmount(() => {
    stopContainerWatch()
    stopModelWatch()
    disposeEditor()
  })

  return { failed, loading }
}

function loadMonaco(): Promise<typeof Monaco> {
  if (!monacoPromise) {
    const global = globalThis as typeof globalThis & MonacoEnvironmentGlobal
    global.MonacoEnvironment = { getWorker: () => new EditorWorker() }
    monacoPromise = Promise.all([
      import('monaco-editor/editor/editor.api.js'),
      import('monaco-editor/features/codicon/register.js'),
      import('monaco-editor/languages/definitions/css/register.js'),
      import('monaco-editor/languages/definitions/html/register.js'),
      import('monaco-editor/languages/definitions/javascript/register.js'),
      import('monaco-editor/languages/definitions/markdown/register.js'),
      import('monaco-editor/languages/definitions/python/register.js'),
      import('monaco-editor/languages/definitions/rust/register.js'),
      import('monaco-editor/languages/definitions/scss/register.js'),
      import('monaco-editor/languages/definitions/typescript/register.js'),
      import('monaco-editor/languages/definitions/xml/register.js'),
      import('monaco-editor/languages/definitions/yaml/register.js'),
    ]).then(([monaco]) => monaco)
  }
  return monacoPromise
}

function syncTheme(monaco: typeof Monaco): void {
  monaco.editor.setTheme(
    document.documentElement.dataset.buddyTheme === 'dark' ? 'vs-dark' : 'vs',
  )
}
