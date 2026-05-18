import type { DocumentItem, DocumentTreeCollectionId } from '@haohaoxue/samepage-contracts'
import { buildDocumentPath } from '@haohaoxue/samepage-shared'
import { useClipboard } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { computed } from 'vue'
import { isOwnedDocumentCollection } from '../utils/documentTree'
import { useDocsContext } from './useDocsContext'
import { useDocsPageActions } from './useDocsPageActions'
import { useDocsShareDialog } from './useDocsShareDialog'
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
    | 'share'

const DOCUMENT_TREE_ITEM_MENU_COMMANDS: readonly DocumentTreeItemMenuCommand[] = [
  'copy-link',
  'delete',
  'duplicate',
  'move',
  'open-new-tab',
  'rename',
  'share',
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
  const { canOpenShareDialog, openDocumentShareDialog } = useDocsShareDialog()
  const { copy, isSupported: isClipboardSupported } = useClipboard({
    legacy: true,
  })

  const item = computed(options.item)
  const collectionId = computed(options.collectionId)
  const isActive = computed(() => activeDocumentId.value === item.value.id)
  const canManageDocument = computed(() =>
    isOwnedDocumentCollection(collectionId.value),
  )
  const canShareDocument = computed(() =>
    canManageDocument.value && canOpenShareDialog.value,
  )
  const isActionPending = computed(() =>
    tree.isMutatingTree.value || pageActions.isDocumentOperationRunning.value,
  )

  function createChild() {
    void tree.createChildDocument(item.value.id)
  }

  function shareDocument() {
    openDocumentShareDialog(item.value.id)
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

    if (canShareDocument.value) {
      items.push({
        command: 'share',
        label: '分享',
        icon: 'document-menu-share',
        divided: true,
      })
    }

    items.push({
      command: 'copy-link',
      label: '复制链接',
      icon: 'link',
      divided: !canShareDocument.value,
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
    'share': () => canShareDocument.value && shareDocument(),
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
    canManageDocument,
    canShareDocument,
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
