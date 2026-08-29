import type * as Monaco from 'monaco-editor/editor/editor.api.js'
import type { Ref } from 'vue'
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import {
  loadDesktopMonaco,
  observeDesktopMonacoTheme,
} from '@/ui/monaco/desktopMonaco'

interface UseMonacoDiffOptions {
  container: Readonly<Ref<HTMLElement | null>>
  language: Readonly<Ref<string | null>>
  modified: Readonly<Ref<string>>
  original: Readonly<Ref<string>>
  path: Readonly<Ref<string>>
}

export function useMonacoDiff(options: UseMonacoDiffOptions) {
  const loading = shallowRef(true)
  const failed = shallowRef(false)
  let editor: Monaco.editor.IStandaloneDiffEditor | null = null
  let originalModel: Monaco.editor.ITextModel | null = null
  let modifiedModel: Monaco.editor.ITextModel | null = null
  let stopThemeSync: (() => void) | null = null
  let generation = 0

  const stopContainerWatch = watch(options.container, async (container) => {
    disposeEditor()
    failed.value = false
    loading.value = true
    if (!container)
      return
    const currentGeneration = ++generation
    try {
      const monaco = await loadDesktopMonaco()
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
      stopThemeSync = observeDesktopMonacoTheme(monaco)
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
      void loadDesktopMonaco().then((monaco) => {
        if (!originalModel || !modifiedModel)
          return
        monaco.editor.setModelLanguage(originalModel, language ?? 'plaintext')
        monaco.editor.setModelLanguage(modifiedModel, language ?? 'plaintext')
      })
    },
  )

  function disposeEditor() {
    generation += 1
    stopThemeSync?.()
    stopThemeSync = null
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
