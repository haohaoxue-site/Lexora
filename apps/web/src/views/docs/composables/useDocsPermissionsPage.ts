import type { DocumentLinkShareMode, DocumentShareMode, UserCollabIdentity } from '@haohaoxue/samepage-contracts'
import type { MaybeRefOrGetter } from 'vue'
import type { DocumentShareChangedPayload } from '../typing'
import type { DocumentCurrent } from '@/apis/document'
import type {
  DocumentPublicShareInfo,
  DocumentShareRecipientSummary,
} from '@/apis/document-share'
import { DOCUMENT_SHARE_MODE } from '@haohaoxue/samepage-contracts'
import {
  getDocumentShareProjectionMode,
  getDocumentTitlePlainText,
  isDocumentLinkShareMode,
} from '@haohaoxue/samepage-shared'
import { useClipboard } from '@vueuse/core'
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, shallowRef, toValue, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getDocumentCurrent } from '@/apis/document'
import {
  createDocumentDirectShare,
  enableDocumentPublicShare,
  getDocumentDirectShares,
  getDocumentPublicShare,
  restoreDocumentShareInheritance,
  revokeDocumentDirectShare,
  revokeDocumentPublicShare,
  setDocumentNoSharePolicy,
} from '@/apis/document-share'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'

/**
 * 分享设置页面参数。
 */
interface UseDocsPermissionsPageOptions {
  /** 文档 ID */
  documentId?: MaybeRefOrGetter<string | null | undefined>
  /** 是否启用加载 */
  enabled?: MaybeRefOrGetter<boolean | null | undefined>
  /** 是否加载公开分享信息 */
  loadPublicShare?: MaybeRefOrGetter<boolean | null | undefined>
  /** 分享变更回调 */
  onShareChanged?: (payload: DocumentShareChangedPayload) => void
}

export function useDocsPermissionsPage(options: UseDocsPermissionsPageOptions = {}) {
  const route = useRoute()
  let currentLoadRequestId = 0
  const currentDocumentId = computed(() => {
    if (options.documentId !== undefined) {
      return (toValue(options.documentId) ?? '').trim()
    }

    return typeof route.params.id === 'string' ? route.params.id : ''
  })
  const isEnabled = computed(() => options.enabled === undefined ? true : Boolean(toValue(options.enabled)))
  const shouldLoadPublicShare = computed(() => options.loadPublicShare === undefined ? true : Boolean(toValue(options.loadPublicShare)))
  const currentDocumentCurrent = shallowRef<DocumentCurrent | null>(null)
  const publicShareInfo = shallowRef<DocumentPublicShareInfo | null>(null)
  const directShareItems = shallowRef<DocumentShareRecipientSummary[]>([])
  const directShareUserCode = shallowRef('')
  const selectedDirectShareUser = shallowRef<UserCollabIdentity | null>(null)
  const selectedShareMode = shallowRef<DocumentShareMode>(DOCUMENT_SHARE_MODE.DIRECT_USER)
  const isLoading = shallowRef(false)
  const isLoadingDirectShares = shallowRef(false)
  const isSubmitting = shallowRef(false)
  const isCreatingDirectShare = shallowRef(false)
  const directShareActionRecipientId = shallowRef('')
  const copiedDirectShareRecipientId = shallowRef('')
  const {
    copy: copyPublicShareText,
    copied: copiedPublicShareLink,
    isSupported: isClipboardSupported,
  } = useClipboard({
    copiedDuring: 1400,
    legacy: true,
  })
  const {
    copy: copyDirectShareText,
    copied: copiedDirectShareLink,
  } = useClipboard({
    copiedDuring: 1400,
    legacy: true,
  })
  const documentShareProjection = computed(() => currentDocumentCurrent.value?.document.share ?? null)
  const isRootDocument = computed(() => currentDocumentCurrent.value?.document.parentId === null)
  const localPolicy = computed(() => documentShareProjection.value?.localPolicy ?? null)
  const effectivePolicy = computed(() => documentShareProjection.value?.effectivePolicy ?? null)
  const isInheritingSharePolicy = computed(() => !localPolicy.value && Boolean(effectivePolicy.value))
  const hasLocalSharePolicy = computed(() => Boolean(localPolicy.value))
  const canRestoreInheritance = computed(() => !isRootDocument.value && hasLocalSharePolicy.value)
  const hasPublicShare = computed(() =>
    isDocumentLinkShareMode(localPolicy.value?.mode) && Boolean(publicShareInfo.value?.share),
  )
  const hasDirectShare = computed(() => directShareItems.value.length > 0)
  const fullShareLink = computed(() => {
    const link = publicShareInfo.value?.share?.link

    if (!link) {
      return ''
    }

    return new URL(link, window.location.origin).toString()
  })
  const currentDocumentTitle = computed(() => {
    const title = currentDocumentCurrent.value
      ? getDocumentTitlePlainText(currentDocumentCurrent.value.currentProjection.title)
      : ''

    return title || '未命名文档'
  })

  watch(
    [currentDocumentId, isEnabled],
    async ([nextDocumentId, nextEnabled]) => {
      const requestId = ++currentLoadRequestId
      currentDocumentCurrent.value = null
      publicShareInfo.value = null
      directShareItems.value = []
      directShareUserCode.value = ''
      selectedDirectShareUser.value = null
      selectedShareMode.value = DOCUMENT_SHARE_MODE.DIRECT_USER
      directShareActionRecipientId.value = ''
      copiedDirectShareRecipientId.value = ''
      isLoading.value = false
      isLoadingDirectShares.value = false

      if (!nextEnabled || !nextDocumentId) {
        return
      }

      await Promise.all([
        loadDocumentCurrent(nextDocumentId, requestId),
        loadDirectShares(nextDocumentId, requestId),
        shouldLoadPublicShare.value
          ? loadPublicShare(nextDocumentId, requestId)
          : Promise.resolve(),
      ])

      if (!canCommitDocumentState(requestId, nextDocumentId)) {
        return
      }

      syncSelectedShareModeWithPolicy()
    },
    {
      immediate: true,
    },
  )

  watch(copiedDirectShareLink, (copied) => {
    if (!copied) {
      copiedDirectShareRecipientId.value = ''
    }
  })

  return {
    currentDocumentId,
    currentDocumentTitle,
    publicShareInfo,
    directShareItems,
    directShareUserCode,
    fullShareLink,
    selectedShareMode,
    hasPublicShare,
    hasDirectShare,
    hasLocalSharePolicy,
    canRestoreInheritance,
    isInheritingSharePolicy,
    isRootDocument,
    localPolicy,
    effectivePolicy,
    isLoading,
    isLoadingDirectShares,
    isSubmitting,
    isCreatingDirectShare,
    directShareActionRecipientId,
    selectedDirectShareUser,
    setSelectedShareMode,
    enablePublicShare,
    revokePublicShare,
    setNoShare,
    restoreInheritance,
    copyPublicShareLink,
    copiedPublicShareLink,
    handleDirectShareResolved,
    handleDirectShareCleared,
    createDirectShare,
    copyDirectShareLink,
    isDirectShareLinkCopied,
    revokeDirectShare,
  }

  function setSelectedShareMode(mode: DocumentShareMode) {
    selectedShareMode.value = mode
  }

  async function enablePublicShare(mode: DocumentLinkShareMode = DOCUMENT_SHARE_MODE.LOGGED_IN) {
    const documentId = currentDocumentId.value

    if (!documentId || isSubmitting.value) {
      return
    }

    isSubmitting.value = true

    try {
      const confirmUnlinkInheritance = await confirmInheritanceUnlinkIfNeeded()

      if (!publicShareInfo.value?.share || publicShareInfo.value.share.mode !== mode) {
        publicShareInfo.value = await enableDocumentPublicShare(documentId, {
          mode,
          confirmUnlinkInheritance,
        })
      }

      directShareItems.value = []
      selectedShareMode.value = mode
      await reloadDocumentCurrent(documentId)
      notifyShareChanged(documentId)
      ElMessage.success(mode === DOCUMENT_SHARE_MODE.PUBLIC ? '已开启公开访问' : '已开启登录访问')
    }
    catch (error) {
      if (isMessageBoxCancel(error)) {
        return
      }

      ElMessage.error(getRequestErrorDisplayMessage(error, '设置链接分享失败'))
    }
    finally {
      isSubmitting.value = false
    }
  }

  async function revokePublicShare() {
    const documentId = currentDocumentId.value

    if (!documentId || isSubmitting.value) {
      return
    }

    isSubmitting.value = true

    try {
      await revokePublicShareInternal(documentId)
      await reloadDocumentCurrent(documentId)
      notifyShareChanged(documentId)
      ElMessage.success('已关闭当前页面的链接分享')
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '关闭链接分享失败'))
    }
    finally {
      isSubmitting.value = false
    }
  }

  async function setNoShare() {
    const documentId = currentDocumentId.value

    if (!documentId || isSubmitting.value) {
      return
    }

    isSubmitting.value = true

    try {
      const confirmUnlinkInheritance = await confirmInheritanceUnlinkIfNeeded()
      await setDocumentNoSharePolicy(documentId, {
        confirmUnlinkInheritance,
      })
      publicShareInfo.value = {
        share: null,
      }
      directShareItems.value = []
      selectedShareMode.value = DOCUMENT_SHARE_MODE.NONE
      await reloadDocumentCurrent(documentId)
      notifyShareChanged(documentId)
      ElMessage.success('当前页面已设为不分享')
    }
    catch (error) {
      if (isMessageBoxCancel(error)) {
        return
      }

      ElMessage.error(getRequestErrorDisplayMessage(error, '设置不分享失败'))
    }
    finally {
      isSubmitting.value = false
    }
  }

  async function restoreInheritance() {
    const documentId = currentDocumentId.value

    if (!documentId || isSubmitting.value) {
      return
    }

    isSubmitting.value = true

    try {
      await restoreDocumentShareInheritance(documentId)
      await Promise.all([
        loadDocumentCurrent(documentId, currentLoadRequestId),
        loadDirectShares(documentId, currentLoadRequestId),
        shouldLoadPublicShare.value
          ? loadPublicShare(documentId, currentLoadRequestId)
          : Promise.resolve(),
      ])
      syncSelectedShareModeWithPolicy()
      notifyShareChanged(documentId)
      ElMessage.success('已恢复继承父级权限')
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '恢复继承失败'))
    }
    finally {
      isSubmitting.value = false
    }
  }

  async function copyPublicShareLink() {
    if (!fullShareLink.value) {
      return
    }

    if (!isClipboardSupported.value) {
      ElMessage.error('当前环境不支持复制')
      return
    }

    try {
      await copyPublicShareText(fullShareLink.value)
      ElMessage.success('分享链接已复制')
    }
    catch {
      ElMessage.error('复制链接失败，请手动复制')
    }
  }

  function handleDirectShareResolved(user: UserCollabIdentity) {
    directShareUserCode.value = user.userCode
    selectedDirectShareUser.value = user
  }

  function handleDirectShareCleared() {
    selectedDirectShareUser.value = null
  }

  async function createDirectShare() {
    const documentId = currentDocumentId.value

    if (!documentId || !selectedDirectShareUser.value || isCreatingDirectShare.value) {
      return
    }

    isCreatingDirectShare.value = true

    try {
      const confirmUnlinkInheritance = await confirmInheritanceUnlinkIfNeeded()
      const createdShare = await createDocumentDirectShare(documentId, {
        userCode: selectedDirectShareUser.value.userCode,
        confirmUnlinkInheritance,
      })
      directShareItems.value = [
        createdShare,
        ...directShareItems.value.filter(item => item.recipient.id !== createdShare.recipient.id),
      ]
      selectedShareMode.value = DOCUMENT_SHARE_MODE.DIRECT_USER
      publicShareInfo.value = {
        share: null,
      }
      await reloadDocumentCurrent(documentId)
      notifyShareChanged(documentId)
      ElMessage.success(`已分享给 ${selectedDirectShareUser.value.displayName}`)
      directShareUserCode.value = ''
      selectedDirectShareUser.value = null
    }
    catch (error) {
      if (isMessageBoxCancel(error)) {
        return
      }

      ElMessage.error(getRequestErrorDisplayMessage(error, '分享失败'))
    }
    finally {
      isCreatingDirectShare.value = false
    }
  }

  async function copyDirectShareLink(item: DocumentShareRecipientSummary) {
    const fullLink = resolveFullShareLink(item.link)

    if (!fullLink) {
      return
    }

    if (!isClipboardSupported.value) {
      ElMessage.error('当前环境不支持复制')
      return
    }

    try {
      await copyDirectShareText(fullLink)
      copiedDirectShareRecipientId.value = item.recipient.id
      ElMessage.success('分享链接已复制')
    }
    catch {
      ElMessage.error('复制链接失败，请手动复制')
    }
  }

  function isDirectShareLinkCopied(item: DocumentShareRecipientSummary) {
    return copiedDirectShareLink.value && copiedDirectShareRecipientId.value === item.recipient.id
  }

  async function revokeDirectShare(item: DocumentShareRecipientSummary) {
    const documentId = currentDocumentId.value

    if (!documentId || directShareActionRecipientId.value) {
      return
    }

    directShareActionRecipientId.value = item.recipient.id

    try {
      await revokeDocumentDirectShare(documentId, item.recipient.id)
      directShareItems.value = directShareItems.value.filter(candidate => candidate.recipient.id !== item.recipient.id)
      await reloadDocumentCurrent(documentId)
      notifyShareChanged(documentId)
      ElMessage.success(`已取消对 ${item.recipientUser.displayName} 的分享`)
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '取消分享失败'))
    }
    finally {
      if (directShareActionRecipientId.value === item.recipient.id) {
        directShareActionRecipientId.value = ''
      }
    }
  }

  async function loadPublicShare(documentId: string, requestId: number) {
    isLoading.value = true

    try {
      const nextPublicShareInfo = await getDocumentPublicShare(documentId)

      if (!canCommitDocumentState(requestId, documentId)) {
        return
      }

      publicShareInfo.value = nextPublicShareInfo
    }
    catch (error) {
      if (!canCommitDocumentState(requestId, documentId)) {
        return
      }

      publicShareInfo.value = {
        share: null,
      }
      ElMessage.error(getRequestErrorDisplayMessage(error, '分享设置加载失败'))
    }
    finally {
      if (canCommitDocumentState(requestId, documentId)) {
        isLoading.value = false
      }
    }
  }

  async function loadDirectShares(documentId: string, requestId: number) {
    isLoadingDirectShares.value = true

    try {
      const nextDirectShareItems = await getDocumentDirectShares(documentId)

      if (!canCommitDocumentState(requestId, documentId)) {
        return
      }

      directShareItems.value = nextDirectShareItems
    }
    catch (error) {
      if (!canCommitDocumentState(requestId, documentId)) {
        return
      }

      directShareItems.value = []
      ElMessage.error(getRequestErrorDisplayMessage(error, '分享对象加载失败'))
    }
    finally {
      if (canCommitDocumentState(requestId, documentId)) {
        isLoadingDirectShares.value = false
      }
    }
  }

  async function loadDocumentCurrent(documentId: string, requestId: number) {
    try {
      const nextDocumentCurrent = await getDocumentCurrent(documentId)

      if (!canCommitDocumentState(requestId, documentId)) {
        return
      }

      currentDocumentCurrent.value = nextDocumentCurrent
    }
    catch (error) {
      if (!canCommitDocumentState(requestId, documentId)) {
        return
      }

      currentDocumentCurrent.value = null
      ElMessage.error(getRequestErrorDisplayMessage(error, '文档信息加载失败'))
    }
  }

  async function revokePublicShareInternal(documentId: string) {
    await revokeDocumentPublicShare(documentId)
    publicShareInfo.value = {
      share: null,
    }
  }

  function resolveFullShareLink(link: string) {
    if (!link) {
      return ''
    }

    return new URL(link, window.location.origin).toString()
  }

  function canCommitDocumentState(requestId: number, documentId: string) {
    return requestId === currentLoadRequestId && currentDocumentId.value === documentId
  }

  function syncSelectedShareModeWithPolicy() {
    selectedShareMode.value = getDocumentShareProjectionMode(documentShareProjection.value)
  }

  function notifyShareChanged(documentId: string) {
    options.onShareChanged?.({
      documentId,
      share: documentShareProjection.value,
    })
  }

  async function reloadDocumentCurrent(documentId: string) {
    await loadDocumentCurrent(documentId, currentLoadRequestId)
  }

  async function confirmInheritanceUnlinkIfNeeded() {
    if (!isInheritingSharePolicy.value) {
      return false
    }

    await ElMessageBox.confirm(
      '操作将解除该页面与其上级页面之间的关联，从而不再延用分享设置',
      '解除继承确认',
      {
        confirmButtonText: '继续操作',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )

    return true
  }

  function isMessageBoxCancel(error: unknown) {
    return error === 'cancel' || error === 'close'
  }
}
