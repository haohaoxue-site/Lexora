import type * as Monaco from 'monaco-editor/editor/editor.api.js'
import type { Ref } from 'vue'
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import {
  loadDesktopMonaco,
  observeDesktopMonacoTheme,
} from '@/ui/monaco/desktopMonaco'

export type DesktopTerminalShell = 'bash' | 'powershell'

export interface DesktopTerminalTranscriptProjection {
  language: 'powershell' | 'shell'
  lineCount: number
  outputStartLine: number | null
  promptRanges: ReadonlyArray<{
    endColumn: number
    lineNumber: number
  }>
  text: string
}

export type DesktopTerminalTranscriptModelUpdate
  = | { kind: 'unchanged' }
    | { commandChanged: boolean, kind: 'replace' }
    | { commandChanged: false, kind: 'append', text: string }

interface UseDesktopTerminalTranscriptOptions {
  container: Readonly<Ref<HTMLElement | null>>
  transcript: Readonly<Ref<DesktopTerminalTranscriptProjection>>
}

export function projectDesktopTerminalTranscript(input: {
  command: string
  output: string | null
  shell: DesktopTerminalShell
}): DesktopTerminalTranscriptProjection {
  const commandLines = normalizeLineEndings(input.command).split('\n')
  const firstPrompt = input.shell === 'powershell' ? 'PS> ' : '$ '
  const continuationPrompt = input.shell === 'powershell' ? '>> ' : '> '
  const promptedCommand = commandLines.map((line, index) => (
    `${index === 0 ? firstPrompt : continuationPrompt}${line}`
  ))
  const normalizedOutput = input.output ? normalizeLineEndings(input.output) : null
  const outputStartLine = normalizedOutput === null ? null : promptedCommand.length + 2
  const text = normalizedOutput === null
    ? promptedCommand.join('\n')
    : `${promptedCommand.join('\n')}\n\n${normalizedOutput}`
  return {
    language: input.shell === 'powershell' ? 'powershell' : 'shell',
    lineCount: text.split('\n').length,
    outputStartLine,
    promptRanges: commandLines.map((_, index) => ({
      endColumn: (index === 0 ? firstPrompt : continuationPrompt).length + 1,
      lineNumber: index + 1,
    })),
    text,
  }
}

export function projectDesktopTerminalTranscriptModelUpdate(
  previous: DesktopTerminalTranscriptProjection,
  current: DesktopTerminalTranscriptProjection,
): DesktopTerminalTranscriptModelUpdate {
  const commandChanged = !hasSameTerminalCommand(previous, current)
  if (
    !commandChanged
    && previous.text === current.text
    && previous.outputStartLine === current.outputStartLine
  ) {
    return { kind: 'unchanged' }
  }
  if (!commandChanged && current.text.startsWith(previous.text)) {
    return {
      commandChanged: false,
      kind: 'append',
      text: current.text.slice(previous.text.length),
    }
  }
  return { commandChanged, kind: 'replace' }
}

function hasSameTerminalCommand(
  previous: DesktopTerminalTranscriptProjection,
  current: DesktopTerminalTranscriptProjection,
): boolean {
  if (
    previous.language !== current.language
    || previous.promptRanges.length !== current.promptRanges.length
  ) {
    return false
  }
  const commandLineCount = previous.promptRanges.length
  return previous.text.split('\n', commandLineCount).join('\n')
    === current.text.split('\n', commandLineCount).join('\n')
    && previous.promptRanges.every((range, index) => {
      const currentRange = current.promptRanges[index]
      return currentRange !== undefined
        && range.lineNumber === currentRange.lineNumber
        && range.endColumn === currentRange.endColumn
    })
}

export function useDesktopTerminalTranscript(
  options: UseDesktopTerminalTranscriptOptions,
) {
  const contentHeight = shallowRef<number | null>(null)
  const loading = shallowRef(true)
  const failed = shallowRef(false)
  let appliedTranscript: DesktopTerminalTranscriptProjection | null = null
  let monacoInstance: typeof Monaco | null = null
  let editor: Monaco.editor.IStandaloneCodeEditor | null = null
  let model: Monaco.editor.ITextModel | null = null
  let commandDecorationIds: string[] = []
  let outputDecorationIds: string[] = []
  let contentSizeListener: Monaco.IDisposable | null = null
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
      const transcript = options.transcript.value
      monacoInstance = monaco
      model = monaco.editor.createModel(
        transcript.text,
        transcript.language,
        monaco.Uri.parse(`inmemory://lexora-buddy/terminal/${crypto.randomUUID()}`),
      )
      editor = monaco.editor.create(container, {
        automaticLayout: true,
        bracketPairColorization: { enabled: false, independentColorPoolPerBracketType: false },
        contextmenu: false,
        copyWithSyntaxHighlighting: false,
        cursorBlinking: 'solid',
        cursorWidth: 0,
        domReadOnly: false,
        folding: false,
        fontLigatures: false,
        fontSize: 12.5,
        glyphMargin: false,
        guides: {
          bracketPairs: false,
          bracketPairsHorizontal: false,
          highlightActiveBracketPair: false,
          highlightActiveIndentation: false,
          indentation: false,
        },
        hover: { enabled: 'off' },
        lineDecorationsWidth: 0,
        lineHeight: 20,
        lineNumbers: 'off',
        links: false,
        matchBrackets: 'never',
        minimap: { enabled: false },
        model,
        mouseStyle: 'text',
        occurrencesHighlight: 'off',
        overviewRulerBorder: false,
        overviewRulerLanes: 0,
        padding: { bottom: 0, top: 0 },
        readOnly: true,
        renderLineHighlight: 'none',
        renderValidationDecorations: 'off',
        roundedSelection: false,
        scrollBeyondLastLine: false,
        scrollbar: {
          alwaysConsumeMouseWheel: false,
          horizontal: 'hidden',
          horizontalHasArrows: false,
          horizontalScrollbarSize: 0,
          useShadows: false,
          vertical: 'auto',
          verticalHasArrows: false,
          verticalScrollbarSize: 10,
          verticalSliderSize: 6,
        },
        selectionHighlight: false,
        smoothScrolling: true,
        stickyScroll: { enabled: false },
        wordWrap: 'on',
        wrappingIndent: 'same',
        wrappingStrategy: 'advanced',
      })
      contentHeight.value = editor.getContentHeight()
      contentSizeListener = editor.onDidContentSizeChange((event) => {
        contentHeight.value = event.contentHeight
      })
      commandDecorationIds = updateCommandDecorations(
        monaco,
        editor,
        model,
        transcript,
        commandDecorationIds,
      )
      outputDecorationIds = updateOutputDecoration(
        monaco,
        editor,
        model,
        transcript,
        outputDecorationIds,
      )
      appliedTranscript = transcript
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

  const stopTranscriptWatch = watch(options.transcript, (transcript) => {
    if (!editor || !model || !monacoInstance || !appliedTranscript)
      return
    const update = projectDesktopTerminalTranscriptModelUpdate(appliedTranscript, transcript)
    if (update.kind === 'unchanged')
      return
    const monaco = monacoInstance
    if (model.getLanguageId() !== transcript.language)
      monaco.editor.setModelLanguage(model, transcript.language)
    if (update.kind === 'append') {
      const lineNumber = model.getLineCount()
      const column = model.getLineMaxColumn(lineNumber)
      model.applyEdits([{
        forceMoveMarkers: true,
        range: new monaco.Range(lineNumber, column, lineNumber, column),
        text: update.text,
      }])
    }
    else if (model.getValue() !== transcript.text) {
      model.setValue(transcript.text)
    }
    if (update.kind === 'replace') {
      commandDecorationIds = updateCommandDecorations(
        monaco,
        editor,
        model,
        transcript,
        commandDecorationIds,
      )
    }
    outputDecorationIds = updateOutputDecoration(
      monaco,
      editor,
      model,
      transcript,
      outputDecorationIds,
    )
    appliedTranscript = transcript
  })

  function disposeEditor() {
    generation += 1
    contentSizeListener?.dispose()
    contentSizeListener = null
    contentHeight.value = null
    stopThemeSync?.()
    stopThemeSync = null
    appliedTranscript = null
    monacoInstance = null
    commandDecorationIds = []
    outputDecorationIds = []
    editor?.dispose()
    editor = null
    model?.dispose()
    model = null
  }

  onBeforeUnmount(() => {
    stopContainerWatch()
    stopTranscriptWatch()
    disposeEditor()
  })

  return { contentHeight, failed, loading }
}

function updateCommandDecorations(
  monaco: typeof Monaco,
  editor: Monaco.editor.IStandaloneCodeEditor,
  model: Monaco.editor.ITextModel,
  transcript: DesktopTerminalTranscriptProjection,
  previousIds: string[],
): string[] {
  const commandLastLine = transcript.promptRanges.length
  const decorations: Monaco.editor.IModelDeltaDecoration[] = []
  for (const range of transcript.promptRanges) {
    decorations.push(
      {
        options: { inlineClassName: 'desktop-terminal-transcript__prompt', zIndex: 2 },
        range: new monaco.Range(range.lineNumber, 1, range.lineNumber, range.endColumn),
      },
      {
        options: { inlineClassName: 'desktop-terminal-transcript__command', zIndex: 1 },
        range: new monaco.Range(
          range.lineNumber,
          range.endColumn,
          range.lineNumber,
          model.getLineMaxColumn(range.lineNumber),
        ),
      },
    )
  }
  const commandText = model.getValueInRange(new monaco.Range(
    1,
    1,
    commandLastLine,
    model.getLineMaxColumn(commandLastLine),
  ))
  const tokenizedLines = monaco.editor.tokenize(commandText, transcript.language)
  for (const [lineIndex, tokens] of tokenizedLines.entries()) {
    const lineNumber = lineIndex + 1
    const promptEndColumn = transcript.promptRanges[lineIndex]?.endColumn ?? 1
    const lineMaxColumn = model.getLineMaxColumn(lineNumber)
    for (const [tokenIndex, token] of tokens.entries()) {
      const className = terminalTokenClassName(token.type)
      if (!className)
        continue
      const startColumn = Math.max(token.offset + 1, promptEndColumn)
      const endColumn = Math.min(
        tokens[tokenIndex + 1]?.offset !== undefined
          ? tokens[tokenIndex + 1].offset + 1
          : lineMaxColumn,
        lineMaxColumn,
      )
      if (startColumn >= endColumn)
        continue
      decorations.push({
        options: { inlineClassName: className, zIndex: 3 },
        range: new monaco.Range(lineNumber, startColumn, lineNumber, endColumn),
      })
    }
  }
  const firstCommandLine = model.getLineContent(1)
  const firstCommandStart = transcript.promptRanges[0]?.endColumn ?? 1
  const firstCommandMatch = /\S+/.exec(firstCommandLine.slice(firstCommandStart - 1))
  if (firstCommandMatch) {
    const startColumn = firstCommandStart + firstCommandMatch.index
    decorations.push({
      options: {
        inlineClassName: 'desktop-terminal-transcript__token-command',
        zIndex: 4,
      },
      range: new monaco.Range(
        1,
        startColumn,
        1,
        startColumn + firstCommandMatch[0].length,
      ),
    })
  }
  return editor.deltaDecorations(previousIds, decorations)
}

function updateOutputDecoration(
  monaco: typeof Monaco,
  editor: Monaco.editor.IStandaloneCodeEditor,
  model: Monaco.editor.ITextModel,
  transcript: DesktopTerminalTranscriptProjection,
  previousIds: string[],
): string[] {
  if (transcript.outputStartLine === null)
    return editor.deltaDecorations(previousIds, [])
  const lastLine = model.getLineCount()
  return editor.deltaDecorations(previousIds, [{
    options: { inlineClassName: 'desktop-terminal-transcript__output' },
    range: new monaco.Range(
      transcript.outputStartLine,
      1,
      lastLine,
      model.getLineMaxColumn(lastLine),
    ),
  }])
}

function terminalTokenClassName(type: string): string | null {
  const token = type.toLowerCase()
  if (token.startsWith('comment'))
    return 'desktop-terminal-transcript__token-comment'
  if (token.startsWith('string'))
    return 'desktop-terminal-transcript__token-string'
  if (token.startsWith('keyword'))
    return 'desktop-terminal-transcript__token-keyword'
  if (token.startsWith('type.identifier'))
    return 'desktop-terminal-transcript__token-command'
  if (token.startsWith('attribute.name'))
    return 'desktop-terminal-transcript__token-attribute'
  if (token.startsWith('number') || token.startsWith('constants'))
    return 'desktop-terminal-transcript__token-number'
  if (token.startsWith('variable'))
    return 'desktop-terminal-transcript__token-variable'
  if (token.startsWith('delimiter'))
    return 'desktop-terminal-transcript__token-operator'
  if (token.startsWith('metatag'))
    return 'desktop-terminal-transcript__token-metatag'
  return null
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}
