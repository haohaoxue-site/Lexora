// @vitest-environment jsdom
import type { ChatPromptContextOption } from '@/modules/prompt-input'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, shallowRef } from 'vue'
import ChatComposerSourceMenu from '../ChatComposerSourceMenu.vue'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))

async function mountMenu() {
  const show = shallowRef(false)
  const queries: string[] = []
  const selections: ChatPromptContextOption[] = []
  const options: ChatPromptContextOption[] = [{ description: null, kind: 'file', label: 'notes.txt', path: 'notes.txt', source: { bindingId: 'binding-1', relativePath: 'notes.txt', spaceId: 'space-1' }, value: 'notes.txt' }]
  let attachmentRequests = 0
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp(defineComponent({
    setup() {
      return () => h(ChatComposerSourceMenu, {
        'disabled': false,
        'language': 'zh-CN',
        'loading': false,
        options,
        'show': show.value,
        'onUpdate:show': (visible: boolean) => { show.value = visible },
        'onAttach': () => { attachmentRequests += 1 },
        'onQuery': query => queries.push(query),
        'onSelect': option => selections.push(option),
      })
    },
  }))
  app.mount(root)
  cleanups.push(() => {
    app.unmount()
    root.remove()
  })
  await nextTick()
  const trigger = root.querySelector<HTMLButtonElement>('.desktop-chat-composer__source-trigger')!
  async function open() {
    trigger.click()
    await nextTick()
    await nextTick()
  }
  return {
    get attachmentRequests() {
      return attachmentRequests
    },
    open,
    options,
    queries,
    selections,
    show,
    trigger,
  }
}

describe('chat composer source menu', () => {
  it('closes for local attachment selection and restores trigger focus on Escape from the file picker', async () => {
    const menu = await mountMenu()
    await menu.open()
    expect(menu.trigger.getAttribute('aria-expanded')).toBe('true')
    document.querySelector<HTMLButtonElement>('.desktop-chat-composer__source-action')!.click()
    await nextTick()
    expect(menu.attachmentRequests).toBe(1)
    expect(menu.show.value).toBe(false)

    await menu.open()
    document.querySelectorAll<HTMLButtonElement>('.desktop-chat-composer__source-action')[1]!.click()
    await nextTick()
    expect(menu.queries).toEqual([''])
    expect(document.querySelector('.desktop-chat-composer__source-menu')?.classList.contains('is-files')).toBe(true)
    const input = document.querySelector<HTMLInputElement>('.desktop-chat-composer__source-menu input')!
    input.focus()
    input.value = 'notes'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(menu.queries).toEqual(['', 'notes'])

    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }))
    await nextTick()
    await nextTick()
    expect(menu.show.value).toBe(false)
    expect(document.activeElement).toBe(menu.trigger)
    await menu.open()
    expect(document.querySelectorAll('.desktop-chat-composer__source-action')).toHaveLength(2)
  })

  it('emits the selected source and leaves asynchronous success or failure to its parent', async () => {
    const menu = await mountMenu()
    await menu.open()
    document.querySelectorAll<HTMLButtonElement>('.desktop-chat-composer__source-action')[1]!.click()
    await nextTick()
    document.querySelector<HTMLButtonElement>('[role="option"]')!.click()
    await nextTick()
    expect(menu.selections).toEqual(menu.options)
    expect(menu.show.value).toBe(true)
    menu.show.value = false
    await nextTick()
    expect(menu.trigger.getAttribute('aria-expanded')).toBe('false')
  })
})
