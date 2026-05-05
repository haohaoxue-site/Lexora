import type { DocumentShareInboxMode } from '../typing'
import type { DocumentShareRecipientSummary } from '@/apis/document-share'
import { ElMessage } from 'element-plus'
import { shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import {
  acceptDocumentShare,
  acceptDocumentShareRecipient,
  declineDocumentShare,
  declineDocumentShareRecipient,
  exitDocumentShareRecipient,
  getActiveDocumentShareRecipients,
  getPendingDocumentShareRecipients,
} from '@/apis/document-share'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'

/**
 * 分享收件箱页面参数。
 */
interface UseDocsShareInboxPageOptions {
  /**
   * 页面模式
   * @description pending 表示待接收，active 表示分享给我。
   */
  mode: DocumentShareInboxMode
}

export function useDocsShareInboxPage(options: UseDocsShareInboxPageOptions) {
  const router = useRouter()
  const items = shallowRef<DocumentShareRecipientSummary[]>([])
  const isLoading = shallowRef(false)
  const errorMessage = shallowRef('')
  const actionRecipientId = shallowRef('')

  void loadItems()

  return {
    items,
    isLoading,
    errorMessage,
    actionRecipientId,
    loadItems,
    openItem,
    acceptItem,
    declineItem,
    exitItem,
  }

  async function loadItems() {
    isLoading.value = true
    errorMessage.value = ''

    try {
      items.value = options.mode === 'pending'
        ? await getPendingDocumentShareRecipients()
        : await getActiveDocumentShareRecipients()
    }
    catch (error) {
      items.value = []
      errorMessage.value = getRequestErrorDisplayMessage(error, '分享列表加载失败')
    }
    finally {
      isLoading.value = false
    }
  }

  async function openItem(recipientId: string) {
    const item = findItem(recipientId)

    if (!item) {
      return
    }

    await router.push(getItemRoute(item))
  }

  async function acceptItem(recipientId: string) {
    if (actionRecipientId.value) {
      return
    }

    actionRecipientId.value = recipientId

    try {
      const item = findItem(recipientId)

      if (!item) {
        return
      }

      await (isPublicShareItem(item)
        ? acceptDocumentShare(item.share.id)
        : acceptDocumentShareRecipient(recipientId))
      await router.push(getItemRoute(item))
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '接受分享失败'))
    }
    finally {
      if (actionRecipientId.value === recipientId) {
        actionRecipientId.value = ''
      }
    }
  }

  async function declineItem(recipientId: string) {
    if (actionRecipientId.value) {
      return
    }

    actionRecipientId.value = recipientId

    try {
      const item = findItem(recipientId)

      if (!item) {
        return
      }

      await (isPublicShareItem(item)
        ? declineDocumentShare(item.share.id)
        : declineDocumentShareRecipient(recipientId))
      items.value = items.value.filter(item => item.recipient.id !== recipientId)
      ElMessage.success('已拒绝这次分享')
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '拒绝分享失败'))
    }
    finally {
      if (actionRecipientId.value === recipientId) {
        actionRecipientId.value = ''
      }
    }
  }

  async function exitItem(recipientId: string) {
    if (actionRecipientId.value) {
      return
    }

    actionRecipientId.value = recipientId

    try {
      await exitDocumentShareRecipient(recipientId)
      items.value = items.value.filter(item => item.recipient.id !== recipientId)
      ElMessage.success('已停止接收这次分享')
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '停止接收失败'))
    }
    finally {
      if (actionRecipientId.value === recipientId) {
        actionRecipientId.value = ''
      }
    }
  }

  function findItem(recipientId: string) {
    return items.value.find(item => item.recipient.id === recipientId) ?? null
  }

  function getItemRoute(item: DocumentShareRecipientSummary) {
    if (!isPublicShareItem(item)) {
      return {
        name: 'shared-doc-recipient',
        params: {
          recipientId: item.recipient.id,
        },
      }
    }

    return {
      name: 'shared-docs',
      params: {
        shareId: item.share.id,
      },
    }
  }

  function isPublicShareItem(item: DocumentShareRecipientSummary) {
    return item.share.mode === 'LOGGED_IN'
  }
}
