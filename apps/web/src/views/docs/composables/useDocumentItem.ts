import type { DocumentItem, DocumentTreeCollectionId } from '@haohaoxue/samepage-contracts'
import { buildDocumentPath } from '@haohaoxue/samepage-shared/document'
import { useClipboard } from '@vueuse/core'
import { computed } from 'vue'
import { ElMessage } from '@/utils/element-plus'
import { isOwnedDocumentCollection } from '../utils/documentTree'
import { useDocsCollaborationDialog } from './useDocsCollaborationDialog'
import { useDocsContext } from './useDocsContext'
import { useDocsPageActions } from './useDocsPageActions'
import { useDocumentTree } from './useDocumentTree'

export interface UseDocumentItemOptions {
  item: () => DocumentItem
  collectionId: () => DocumentTreeCollectionId
}

type DocumentTreeItemMenuCommand
  = | 'copy-link'
    | 'delete'
    | 'duplicate'
    | 'move'
    | 'open-new-tab'
    | 'rename'
    | 'collaboration'

const DOCUMENT_TREE_ITEM_MENU_COMMANDS: readonly DocumentTreeItemMenuCommand[] = [
  'copy-link',
  'delete',
  'duplicate',
  'move',
  'open-new-tab',
  'rename',
  'collaboration',
]

interface DocumentTreeItemMenuItem {
  command: DocumentTreeItemMenuCommand
  label: string
  icon: string
  divided?: boolean
  danger?: boolean
}

export function useDocumentItem(options: UseDocumentItemOptions) {
  const { activeDocumentId } = useDocsContext()
  const tree = useDocumentTree()
  const pageActions = useDocsPageActions()
  const { openDocumentCollaborationDialog } = useDocsCollaborationDialog()
  const { copy, isSupported: isClipboardSupported } = useClipboard({
    legacy: true,
  })

  const item = computed(options.item)
  const collectionId = computed(options.collectionId)
  const isActive = computed(() => activeDocumentId.value === item.value.id)
  const canManageDocument = computed(() =>
    isOwnedDocumentCollection(collectionId.value),
  )
  const canManageCollaboration = computed(() =>
    canManageDocument.value,
  )
  const isActionPending = computed(() =>
    tree.isMutatingTree.value || pageActions.isDocumentOperationRunning.value,
  )

  function createChild() {
    void tree.createChildDocument(item.value.id)
  }

  function manageCollaboration() {
    openDocumentCollaborationDialog(item.value.id)
  }

  function openDocumentInNewTab() {
    window.open(buildDocumentPath(item.value.id), '_blank', 'noopener,noreferrer')
  }

  async function copyDocumentLink() {
    if (!isClipboardSupported.value) {
      ElMessage.error('当前环境不支持复制')
      return
    }

    try {
      await copy(new URL(buildDocumentPath(item.value.id), window.location.origin).toString())
      ElMessage.success('链接已复制')
    }
    catch {
      ElMessage.error('复制链接失败')
    }
  }

  function duplicateDocument() {
    void pageActions.duplicateDocumentTree(item.value.id)
  }

  function moveDocument() {
    tree.openMoveDialog(item.value.id)
  }

  function renameDocument() {
    tree.openRenameDialog(item.value.id)
  }

  function deleteDocument() {
    void tree.deleteDocument(item.value.id)
  }

  const itemStateClass = computed(() => isActive.value ? 'active' : 'idle')
  const actionsStateClass = computed(() => isActive.value ? 'visible' : 'hidden')
  const menuItems = computed<DocumentTreeItemMenuItem[]>(() => {
    const items: DocumentTreeItemMenuItem[] = [{
      command: 'open-new-tab',
      label: '在新标签页打开',
      icon: 'document-menu-open-new',
    }]

    if (canManageCollaboration.value) {
      items.push({
        command: 'collaboration',
        label: '协作',
        icon: 'document-menu-share',
        divided: true,
      })
    }

    items.push({
      command: 'copy-link',
      label: '复制链接',
      icon: 'link',
      divided: !canManageCollaboration.value,
    })

    if (canManageDocument.value) {
      items.push(
        {
          command: 'duplicate',
          label: '创建副本',
          icon: 'document-menu-copy',
          divided: true,
        },
        {
          command: 'move',
          label: '移动到',
          icon: 'document-menu-move',
        },
        {
          command: 'rename',
          label: '重命名',
          icon: 'document-menu-rename',
          divided: true,
        },
        {
          command: 'delete',
          label: '删除',
          icon: 'trash-can',
          divided: true,
          danger: true,
        },
      )
    }

    return items
  })
  const menuCommandHandlers: Record<DocumentTreeItemMenuCommand, () => void> = {
    'copy-link': () => void copyDocumentLink(),
    'delete': () => canManageDocument.value && deleteDocument(),
    'duplicate': () => canManageDocument.value && duplicateDocument(),
    'move': () => canManageDocument.value && moveDocument(),
    'open-new-tab': openDocumentInNewTab,
    'rename': () => canManageDocument.value && renameDocument(),
    'collaboration': () => canManageCollaboration.value && manageCollaboration(),
  }

  function handleMenuCommand(command: unknown) {
    if (typeof command !== 'string') {
      return
    }

    if (isDocumentTreeItemMenuCommand(command)) {
      menuCommandHandlers[command]()
    }
  }

  return {
    actionsStateClass,
    canManageCollaboration,
    canManageDocument,
    createChild,
    deleteDocument,
    handleMenuCommand,
    isActionPending,
    itemStateClass,
    menuItems,
  }
}

function isDocumentTreeItemMenuCommand(command: string): command is DocumentTreeItemMenuCommand {
  return DOCUMENT_TREE_ITEM_MENU_COMMANDS.includes(command as DocumentTreeItemMenuCommand)
}
