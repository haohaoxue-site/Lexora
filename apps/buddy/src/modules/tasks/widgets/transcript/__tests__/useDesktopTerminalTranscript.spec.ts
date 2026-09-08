// @vitest-environment jsdom
import type * as Monaco from 'monaco-editor/editor/editor.api.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'
import { projectDesktopTerminalTranscript } from '../../../model/transcript/terminalTranscript'
import { useDesktopTerminalTranscript } from '../useDesktopTerminalTranscript'

const integration = vi.hoisted(() => ({ load: vi.fn(), observeTheme: vi.fn() }))
vi.mock('@/shared/ui/monaco/desktopMonaco', () => ({ loadDesktopMonaco: integration.load, observeDesktopMonacoTheme: integration.observeTheme }))

const cleanups: (() => void)[] = []
beforeEach(() => {
  integration.load.mockReset()
  integration.observeTheme.mockReset()
})
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))

describe('terminal Monaco ownership', () => {
  it('appends streaming output on the same model and replaces rewritten commands', async () => {
    const monaco = createMonaco()
    const owner = createOwner()
    await flush()
    const initialModel = monaco.models[0]!
    owner.transcript.value = projection('hello\nworld')
    await flush()
    expect(monaco.models).toEqual([initialModel])
    expect(initialModel.value).toBe('$ echo\n\nhello\nworld')
    expect(initialModel.updates).toEqual([{ kind: 'append', text: 'ello\nworld' }])
    expect(owner.state.contentHeight.value).toBe(80)
    owner.transcript.value = projectDesktopTerminalTranscript({ command: 'echo changed', output: null, shell: 'bash' })
    await flush()
    expect(initialModel.value).toBe('$ echo changed')
    expect(initialModel.updates.at(-1)?.kind).toBe('replace')
    expect(owner.state.contentHeight.value).toBe(20)
  })

  it.each(['resolve', 'reject'] as const)('ignores an old load that finishes with %s after its replacement', async (outcome) => {
    const monaco = createMonaco()
    const firstLoad = deferred<typeof Monaco>()
    const secondLoad = deferred<typeof Monaco>()
    integration.load.mockReturnValueOnce(firstLoad.promise).mockReturnValueOnce(secondLoad.promise)
    const owner = createOwner()
    const replacement = document.createElement('div')
    owner.container.value = replacement
    owner.transcript.value = projection('latest while loading')
    await nextTick()
    secondLoad.resolve(monaco.api)
    await flush()
    if (outcome === 'resolve')
      firstLoad.resolve(monaco.api)
    else
      firstLoad.reject(new Error('Old load failed'))
    await flush()
    expect(monaco.editors.map(editor => editor.container)).toEqual([replacement])
    expect(monaco.models[0]?.value).toBe('$ echo\n\nlatest while loading')
    expect(owner.state.loading.value).toBe(false)
    expect(owner.state.failed.value).toBe(false)
    expect(monaco.activeThemes()).toBe(1)
  })

  it('releases the prior editor, subscriptions and model when its container disappears', async () => {
    const monaco = createMonaco()
    const owner = createOwner()
    await flush()
    const priorModel = monaco.models[0]!
    const priorEditor = monaco.editors[0]!
    owner.container.value = null
    await flush()
    expect(priorModel.disposed).toBe(true)
    expect(priorEditor.disposed).toBe(true)
    expect(priorEditor.listening).toBe(false)
    expect(monaco.activeThemes()).toBe(0)
    expect(owner.state.contentHeight.value).toBeNull()
    owner.transcript.value = projection('new container')
    owner.container.value = document.createElement('div')
    await flush()
    expect(priorModel.value).toBe('$ echo\n\nh')
    expect(monaco.models[1]?.value).toBe('$ echo\n\nnew container')
    owner.stop()
    expect(monaco.models.every(model => model.disposed)).toBe(true)
    expect(monaco.editors.every(editor => editor.disposed && !editor.listening)).toBe(true)
    expect(monaco.activeThemes()).toBe(0)
  })

  it('does not create a model when loading finishes after disposal', async () => {
    const monaco = createMonaco()
    const loading = deferred<typeof Monaco>()
    integration.load.mockReturnValueOnce(loading.promise)
    const owner = createOwner()
    owner.stop()
    loading.resolve(monaco.api)
    await flush()
    expect(monaco.models).toEqual([])
    expect(monaco.editors).toEqual([])
    expect(monaco.activeThemes()).toBe(0)
  })

  it.each(['editor', 'theme'] as const)('releases partial initialization when %s setup fails', async (failure) => {
    const monaco = createMonaco(failure)
    const owner = createOwner()
    await flush()
    expect(owner.state.failed.value).toBe(true)
    expect(owner.state.loading.value).toBe(false)
    expect(owner.state.contentHeight.value).toBeNull()
    expect(monaco.models).toHaveLength(1)
    expect(monaco.models.every(model => model.disposed)).toBe(true)
    expect(monaco.editors.every(editor => editor.disposed && !editor.listening)).toBe(true)
    owner.transcript.value = projection('ignored after failure')
    await flush()
    expect(monaco.models[0]?.value).toBe('$ echo\n\nh')
    expect(monaco.activeThemes()).toBe(0)
  })
})

function createOwner() {
  const scope = effectScope()
  const container = shallowRef<HTMLElement | null>(document.createElement('div'))
  const transcript = shallowRef(projection('h'))
  const state = scope.run(() => useDesktopTerminalTranscript({ container, transcript }))!
  const stop = () => scope.stop()
  cleanups.push(stop)
  return { container, state, stop, transcript }
}

function projection(output: string) {
  return projectDesktopTerminalTranscript({ command: 'echo', output, shell: 'bash' })
}

async function flush() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, reject, resolve }
}

class TestModel {
  disposed = false
  updates: { kind: 'append' | 'replace', text: string }[] = []
  onChange: (() => void) | null = null

  constructor(public value: string, public language: string) {}

  getLanguageId() { return this.language }
  getValue() { return this.value }
  getLineCount() { return this.value.split('\n').length }
  getLineContent(line: number) { return this.value.split('\n')[line - 1]! }
  getLineMaxColumn(line: number) { return this.getLineContent(line).length + 1 }
  getValueInRange(range: Monaco.IRange) {
    return this.value.slice(this.offset(range.startLineNumber, range.startColumn), this.offset(range.endLineNumber, range.endColumn))
  }

  setValue(value: string) {
    this.updates.push({ kind: 'replace', text: value })
    this.value = value
    this.onChange?.()
  }

  applyEdits(edits: Monaco.editor.IIdentifiedSingleEditOperation[]) {
    for (const edit of edits) {
      expect(edit.forceMoveMarkers).toBe(true)
      expect(this.offset(edit.range.startLineNumber, edit.range.startColumn)).toBe(this.value.length)
      this.updates.push({ kind: 'append', text: edit.text ?? '' })
      this.value += edit.text ?? ''
    }
    this.onChange?.()
  }

  dispose() {
    this.disposed = true
  }

  private offset(line: number, column: number) {
    return this.value.split('\n').slice(0, line - 1).reduce((total, text) => total + text.length + 1, 0) + column - 1
  }
}

function createMonaco(failure?: 'editor' | 'theme') {
  const models: TestModel[] = []
  const editors: { container: HTMLElement, disposed: boolean, listening: boolean }[] = []
  let activeThemes = 0
  const api = {
    Uri: { parse: (value: string) => value },
    Range: class {
      constructor(public startLineNumber: number, public startColumn: number, public endLineNumber: number, public endColumn: number) {}
    },
    editor: {
      createModel(value: string, language: string) {
        const model = new TestModel(value, language)
        models.push(model)
        return model
      },
      create(container: HTMLElement, options: { model: TestModel }) {
        if (failure === 'editor')
          throw new Error('Editor initialization failed')
        const editor = {
          container,
          disposed: false,
          listening: false,
          getContentHeight: () => options.model.getLineCount() * 20,
          onDidContentSizeChange: (listener: (event: { contentHeight: number }) => void) => {
            editor.listening = true
            options.model.onChange = () => listener({ contentHeight: editor.getContentHeight() })
            return { dispose: () => {
              editor.listening = false
              options.model.onChange = null
            } }
          },
          deltaDecorations: () => [],
          dispose: () => { editor.disposed = true },
        }
        editors.push(editor)
        return editor
      },
      tokenize: (text: string) => text.split('\n').map(() => []),
      setModelLanguage: (model: TestModel, language: string) => { model.language = language },
    },
  } as unknown as typeof Monaco
  integration.load.mockResolvedValue(api)
  integration.observeTheme.mockImplementation(() => {
    if (failure === 'theme')
      throw new Error('Theme observer initialization failed')
    activeThemes += 1
    return () => {
      activeThemes -= 1
    }
  })
  return { activeThemes: () => activeThemes, api, editors, models }
}
