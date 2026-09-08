// @vitest-environment jsdom
import type * as Monaco from 'monaco-editor/editor/editor.api.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'
import { deferred } from '../../../../../../__tests__/deferred'
import { useMonacoDiff } from '../useMonacoDiff'

const integration = vi.hoisted(() => ({ load: vi.fn(), theme: vi.fn() }))
vi.mock('@/shared/ui/monaco/desktopMonaco', () => ({ loadDesktopMonaco: integration.load, observeDesktopMonacoTheme: integration.theme }))
const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))

function fixture(failure?: 'model' | 'editor' | 'theme') {
  const models: { disposed: boolean, value: string, language: string, uri: string, writes: number, getValue: () => string, getLanguageId: () => string, setValue: (text: string) => void, dispose: () => void }[] = []
  const editors: { disposed: boolean, restored: number, setModel: () => void, saveViewState: () => object, restoreViewState: () => void, dispose: () => void }[] = []
  let themes = 0
  const api = {
    Uri: { parse: (uri: string) => uri },
    editor: {
      createModel(value: string, language: string, uri: string) {
        if (failure === 'model' && models.length === 1)
          throw new Error('second model failed')
        const model = {
          disposed: false,
          value,
          language,
          uri,
          writes: 0,
          getValue: () => model.value,
          getLanguageId: () => model.language,
          setValue: (text: string) => {
            model.value = text
            model.writes++
          },
          dispose: () => {
            model.disposed = true
          },
        }
        models.push(model)
        return model
      },
      createDiffEditor() {
        if (failure === 'editor')
          throw new Error('editor failed')
        const editor = {
          disposed: false,
          restored: 0,
          setModel() {},
          saveViewState: () => ({
            original: {
              scrollTop: 42,
            },
          }),
          restoreViewState: () => {
            editor.restored++
          },
          dispose: () => {
            editor.disposed = true
          },
        }
        editors.push(editor)
        return editor
      },
      setModelLanguage(model: typeof models[number], language: string) { model.language = language },
    },
  } as unknown as typeof Monaco
  integration.load.mockReset().mockResolvedValue(api)
  integration.theme.mockReset().mockImplementation(() => {
    if (failure === 'theme')
      throw new Error('theme failed')
    themes++
    return () => {
      themes--
    }
  })
  const scope = effectScope()
  const container = shallowRef<HTMLElement | null>(document.createElement('div'))
  const path = shallowRef('first.ts')
  const original = shallowRef('before')
  const modified = shallowRef('after')
  const language = shallowRef<string | null>('typescript')
  const create = () => scope.run(() => useMonacoDiff({ container, path, original, modified, language }))!
  cleanups.push(() => scope.stop())
  return { api, container, create, editors, language, models, modified, path, scope, themes: () => themes }
}

describe('diff model ownership', () => {
  it('updates the current models without rewriting unchanged text and preserves view state', async () => {
    const f = fixture()
    f.create()
    await nextTick()
    f.language.value = 'javascript'
    expect(f.models.map(model => model.writes)).toEqual([0, 0])
    expect(f.models.map(model => model.language)).toEqual(['javascript', 'javascript'])
    f.modified.value = 'changed'
    expect(f.models.map(model => model.value)).toEqual(['before', 'changed'])
    expect(f.editors[0]?.restored).toBe(2)
    f.path.value = 'second.js'
    await nextTick()
    expect(f.models.slice(0, 2).every(model => model.disposed)).toBe(true)
    expect(f.models[2]?.uri).toContain('/before/second.js')
    expect(f.themes()).toBe(1)
    f.scope.stop()
    expect(f.models.every(model => model.disposed)).toBe(true)
    expect(f.editors.every(editor => editor.disposed)).toBe(true)
    expect(f.themes()).toBe(0)
  })

  it('invalidates late initialization on file replacement and scope disposal', async () => {
    const f = fixture()
    const loading = deferred<typeof Monaco>()
    integration.load.mockReturnValueOnce(loading.promise)
    f.create()
    f.path.value = 'second.ts'
    await nextTick()
    loading.resolve(f.api)
    await nextTick()
    expect(f.models).toHaveLength(2)
    expect(f.models.every(model => model.uri.includes('second.ts'))).toBe(true)
    const last = deferred<typeof Monaco>()
    integration.load.mockReturnValueOnce(last.promise)
    f.path.value = 'disposed.ts'
    f.scope.stop()
    last.resolve(f.api)
    await nextTick()
    expect(f.models).toHaveLength(2)
    expect(f.themes()).toBe(0)
  })

  it.each(['model', 'editor', 'theme'] as const)('releases all partial resources after %s initialization failure', async (failure) => {
    const f = fixture(failure)
    const state = f.create()
    await nextTick()
    expect(state.failed.value).toBe(true)
    expect(state.loading.value).toBe(false)
    expect(f.models.every(model => model.disposed)).toBe(true)
    expect(f.editors.every(editor => editor.disposed)).toBe(true)
    expect(f.themes()).toBe(0)
  })
})
