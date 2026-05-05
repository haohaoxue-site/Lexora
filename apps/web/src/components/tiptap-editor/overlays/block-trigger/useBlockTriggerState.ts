import type { Editor } from '@tiptap/core'
import { computed } from 'vue'
import { getBlockTriggerViewState } from '../catalog/menuRegistry'
import { useEditorSnapshot } from '../shared/useEditorSnapshot'

export function useBlockTriggerState(editor: Editor) {
  const editorSnapshot = useEditorSnapshot(editor, {
    ignoreCollaborationOrigin: true,
  })

  return computed(() => {
    void editorSnapshot.value
    return getBlockTriggerViewState(editor)
  })
}
