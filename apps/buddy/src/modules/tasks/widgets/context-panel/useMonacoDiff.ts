import type * as Monaco from 'monaco-editor/editor/editor.api.js'
import type { Ref } from 'vue'
import { readonly, shallowRef, watch } from 'vue'
import {
  loadDesktopMonaco,
  observeDesktopMonacoTheme,
} from '@/shared/ui/monaco/desktopMonaco'

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

  watch([options.container, options.path], async ([container, path], _previous, onCleanup) => {
    let active = true
    let editor: Monaco.editor.IStandaloneDiffEditor | null = null
    let originalModel: Monaco.editor.ITextModel | null = null
    let modifiedModel: Monaco.editor.ITextModel | null = null
    let stopThemeSync: (() => void) | null = null
    let stopModelWatch: (() => void) | null = null
    function dispose() {
      stopModelWatch?.()
      stopModelWatch = null
      stopThemeSync?.()
      stopThemeSync = null
      editor?.dispose()
      editor = null
      originalModel?.dispose()
      originalModel = null
      modifiedModel?.dispose()
      modifiedModel = null
    }
    onCleanup(() => {
      active = false
      dispose()
    })
    failed.value = false
    loading.value = Boolean(container)
    if (!container)
      return
    try {
      const monaco = await loadDesktopMonaco()
      if (!active)
        return
      const modelId = crypto.randomUUID()
      const language = options.language.value ?? 'plaintext'
      originalModel = monaco.editor.createModel(
        options.original.value,
        language,
        monaco.Uri.parse(`inmemory://lexora-buddy/${modelId}/before/${path}`),
      )
      modifiedModel = monaco.editor.createModel(
        options.modified.value,
        language,
        monaco.Uri.parse(`inmemory://lexora-buddy/${modelId}/after/${path}`),
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
      stopModelWatch = watch([options.original, options.modified, options.language], ([original, modified, language]) => {
        if (!editor || !originalModel || !modifiedModel)
          return
        const viewState = editor.saveViewState()
        if (originalModel.getValue() !== original)
          originalModel.setValue(original)
        if (modifiedModel.getValue() !== modified)
          modifiedModel.setValue(modified)
        for (const model of [originalModel, modifiedModel]) {
          if (model.getLanguageId() !== (language ?? 'plaintext'))
            monaco.editor.setModelLanguage(model, language ?? 'plaintext')
        }
        if (viewState)
          editor.restoreViewState(viewState)
      }, { flush: 'sync' })
      loading.value = false
    }
    catch {
      dispose()
      if (active) {
        failed.value = true
        loading.value = false
      }
    }
  }, { immediate: true, flush: 'sync' })

  return { failed: readonly(failed), loading: readonly(loading) }
}
