import type { Editor, EditorEvents } from '@tiptap/core'
import { onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { isCollaborationOriginTransaction } from './collaborationOrigin'

type EditorSnapshotEvent = 'selectionUpdate' | 'transaction' | 'focus' | 'blur'

const DEFAULT_EDITOR_SNAPSHOT_EVENTS = [
  'selectionUpdate',
  'transaction',
  'focus',
  'blur',
] as const satisfies readonly EditorSnapshotEvent[]

interface UseEditorSnapshotOptions {
  events?: readonly EditorSnapshotEvent[]
  ignoreCollaborationOrigin?: boolean
}

export function useEditorSnapshot(
  editor: Editor,
  options: UseEditorSnapshotOptions = {},
) {
  const version = shallowRef(0)
  const events = options.events ?? DEFAULT_EDITOR_SNAPSHOT_EVENTS
  const ignoreCollaborationOrigin = options.ignoreCollaborationOrigin ?? false

  function syncSnapshot() {
    version.value += 1
  }

  const eventHandlers = {
    selectionUpdate: (event?: EditorEvents['selectionUpdate']) => {
      if (ignoreCollaborationOrigin && isCollaborationOriginTransaction(event?.transaction)) {
        return
      }

      syncSnapshot()
    },
    transaction: (event?: EditorEvents['transaction']) => {
      if (ignoreCollaborationOrigin && isCollaborationOriginTransaction(event?.transaction)) {
        return
      }

      syncSnapshot()
    },
    focus: () => {
      syncSnapshot()
    },
    blur: () => {
      syncSnapshot()
    },
  }

  onMounted(() => {
    if (typeof editor.on !== 'function') {
      return
    }

    events.forEach(event => editor.on(event, eventHandlers[event] as never))
  })

  onBeforeUnmount(() => {
    if (typeof editor.off !== 'function') {
      return
    }

    events.forEach(event => editor.off(event, eventHandlers[event] as never))
  })

  return version
}
