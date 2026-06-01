import type { Editor } from '@tiptap/core'
import type { ShallowRef } from 'vue'
import type { EditorAiAnchorRect, EditorAiComposerDraft, EditorAiComposerMode, EditorAiComposerStatus, EditorAiSessionRuntime } from './typing'
import { AI_EDITOR_STREAM_EVENT_TYPE } from '@haohaoxue/samepage-contracts'
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { acceptAiEditorCandidate, getAiDefaultModels, rejectAiEditorCandidate } from '@/apis/ai'
import { showAiDefaultModelMissingDialog } from '@/composables/useAiDefaultModelDialog'
import {
  buildAiDefaultModelPolicyRecord,
  isAiDefaultModelPolicyReady,
  resolveEffectiveAiDefaultModelPolicy,
} from '@/utils/ai-default-model'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import {
  EDITOR_AI_ACCEPT_ERROR_FALLBACK,
  EDITOR_AI_COMPOSER_ANCHOR_GAP,
  EDITOR_AI_COMPOSER_ERROR_FALLBACK,
  EDITOR_AI_COMPOSER_MODE,
  EDITOR_AI_COMPOSER_STATUS,
  EDITOR_AI_COMPOSER_SUBMITTABLE_STATUS,
  EDITOR_AI_COMPOSER_VIEWPORT_PADDING,
  EDITOR_AI_COMPOSER_WIDTH,
  EDITOR_AI_GENERATE_TRIGGER_KEY,
  EDITOR_AI_MODEL_INTENT_KEY_BY_COMPOSER_MODE,
  EDITOR_AI_PREVIEW_STATUS,
  EDITOR_AI_REJECT_ERROR_FALLBACK,
  EDITOR_AI_STALE_ANCHOR_MESSAGE,
  EDITOR_AI_WORKFLOW_KEY_BY_COMPOSER_MODE,
} from './constants'
import { resolveEditorAiGenerateAnchor, resolveEditorAiRewriteAnchor } from './editorAiAnchor'
import { clearEditorAiPreview, setEditorAiPreview } from './EditorAiPreview'
import { streamEditorAiSession } from './editorAiSessionStream'
import { acceptEditorAiCandidateWriteback } from './editorAiWriteback'

export interface UseEditorAiComposerOptions {
  editor: ShallowRef<Editor | null>
  getDocumentId: () => string | null | undefined
  getEditable: () => boolean
}

export function useEditorAiComposer(options: UseEditorAiComposerOptions) {
  const router = useRouter()
  const activeDraft = shallowRef<EditorAiComposerDraft | null>(null)
  const status = shallowRef<EditorAiComposerStatus>(EDITOR_AI_COMPOSER_STATUS.IDLE)
  const prompt = shallowRef('')
  const previewText = shallowRef('')
  const errorMessage = shallowRef('')
  const isCheckingDefaultModel = shallowRef(false)
  const runtime = shallowRef<EditorAiSessionRuntime>({
    session: null,
    run: null,
    candidate: null,
  })
  const abortController = shallowRef<AbortController | null>(null)
  const acceptedWriteback = shallowRef(false)

  const visible = computed(() => Boolean(activeDraft.value))
  const mode = computed<EditorAiComposerMode | null>(() => activeDraft.value?.mode ?? null)
  const anchorStyle = computed(() => activeDraft.value?.anchorStyle)
  const canSubmit = computed(() =>
    Boolean(activeDraft.value)
    && status.value === EDITOR_AI_COMPOSER_SUBMITTABLE_STATUS
    && prompt.value.trim().length > 0,
  )
  const canAccept = computed(() =>
    (
      status.value === EDITOR_AI_COMPOSER_STATUS.READY
      || (
        status.value === EDITOR_AI_COMPOSER_STATUS.ACCEPT_SYNC_FAILED
        && acceptedWriteback.value
      )
    )
    && Boolean(runtime.value.session)
    && Boolean(runtime.value.candidate),
  )
  const canReject = computed(() =>
    status.value === EDITOR_AI_COMPOSER_STATUS.READY
    && Boolean(runtime.value.session)
    && Boolean(runtime.value.candidate),
  )

  watch(
    () => options.editor.value,
    (_nextEditor, previousEditor) => {
      if (previousEditor) {
        clearEditorAiPreview(previousEditor)
      }

      clear()
    },
  )

  onBeforeUnmount(clear)

  function openGenerateFromKeyboard(event: KeyboardEvent): boolean {
    if (event.key !== EDITOR_AI_GENERATE_TRIGGER_KEY || !options.getEditable()) {
      return false
    }

    const draft = resolveDraft(EDITOR_AI_COMPOSER_MODE.GENERATE)
    if (!draft) {
      return false
    }

    event.preventDefault()
    void openDraftWithModelCheck(draft)
    return true
  }

  function openRewrite(): boolean {
    if (!options.getEditable()) {
      return false
    }

    const draft = resolveDraft(EDITOR_AI_COMPOSER_MODE.REWRITE)
    if (!draft) {
      return false
    }

    void openDraftWithModelCheck(draft)
    return true
  }

  function updatePrompt(value: string): void {
    prompt.value = value
  }

  async function submit(): Promise<void> {
    const draft = activeDraft.value
    const editor = options.editor.value
    const normalizedPrompt = prompt.value.trim()

    if (!draft || !editor || !normalizedPrompt || status.value !== EDITOR_AI_COMPOSER_SUBMITTABLE_STATUS) {
      return
    }

    const controller = new AbortController()
    abortController.value = controller
    status.value = EDITOR_AI_COMPOSER_STATUS.STREAMING
    errorMessage.value = ''
    previewText.value = ''
    runtime.value = {
      session: null,
      run: null,
      candidate: null,
    }
    acceptedWriteback.value = false
    setEditorAiPreview(editor, {
      anchor: draft.previewAnchor,
      text: previewText.value,
      status: EDITOR_AI_PREVIEW_STATUS.STREAMING,
    })

    try {
      await streamEditorAiSession({
        workflowKey: draft.workflowKey,
        anchor: draft.requestAnchor,
        prompt: normalizedPrompt,
      }, (event) => {
        if (!isActiveEditorAiRun(controller, draft)) {
          return
        }

        if (event.type === AI_EDITOR_STREAM_EVENT_TYPE.SESSION_CREATED) {
          runtime.value = {
            ...runtime.value,
            session: event.session,
            run: event.run,
          }
          return
        }

        if (event.type === AI_EDITOR_STREAM_EVENT_TYPE.TEXT_DELTA) {
          previewText.value += event.content
          setEditorAiPreview(editor, {
            anchor: draft.previewAnchor,
            text: previewText.value,
            status: EDITOR_AI_PREVIEW_STATUS.STREAMING,
          })
          return
        }

        if (event.type === AI_EDITOR_STREAM_EVENT_TYPE.CANDIDATE_COMPLETED) {
          runtime.value = {
            ...runtime.value,
            candidate: event.candidate,
          }
          status.value = EDITOR_AI_COMPOSER_STATUS.READY
          setEditorAiPreview(editor, {
            anchor: draft.previewAnchor,
            text: previewText.value,
            status: EDITOR_AI_PREVIEW_STATUS.READY,
          })
        }
      }, {
        signal: controller.signal,
      })
    }
    catch (error) {
      if (!isActiveEditorAiRun(controller, draft)) {
        return
      }

      status.value = EDITOR_AI_COMPOSER_STATUS.FAILED
      errorMessage.value = getRequestErrorDisplayMessage(error, EDITOR_AI_COMPOSER_ERROR_FALLBACK)
      setEditorAiPreview(editor, {
        anchor: draft.previewAnchor,
        text: previewText.value,
        status: EDITOR_AI_PREVIEW_STATUS.FAILED,
      })
    }
    finally {
      if (abortController.value === controller) {
        abortController.value = null
      }
    }
  }

  async function accept(): Promise<void> {
    const draft = activeDraft.value
    const editor = options.editor.value
    const {
      candidate,
      session,
    } = runtime.value

    if (
      !draft
      || !editor
      || !session
      || !candidate
      || (
        status.value !== EDITOR_AI_COMPOSER_STATUS.READY
        && status.value !== EDITOR_AI_COMPOSER_STATUS.ACCEPT_SYNC_FAILED
      )
    ) {
      return
    }

    status.value = EDITOR_AI_COMPOSER_STATUS.ACCEPTING
    errorMessage.value = ''

    if (!acceptedWriteback.value) {
      const accepted = acceptEditorAiCandidateWriteback(editor, {
        anchor: draft.requestAnchor,
        contentText: resolveCandidateContentText(candidate),
      })

      if (!accepted) {
        status.value = EDITOR_AI_COMPOSER_STATUS.FAILED
        errorMessage.value = EDITOR_AI_STALE_ANCHOR_MESSAGE
        setEditorAiPreview(editor, {
          anchor: draft.previewAnchor,
          text: previewText.value,
          status: EDITOR_AI_PREVIEW_STATUS.FAILED,
        })
        return
      }

      acceptedWriteback.value = true
    }

    try {
      await acceptAiEditorCandidate(session.sessionId, candidate.candidateId)
      clear()
    }
    catch (error) {
      status.value = EDITOR_AI_COMPOSER_STATUS.ACCEPT_SYNC_FAILED
      errorMessage.value = getRequestErrorDisplayMessage(error, EDITOR_AI_ACCEPT_ERROR_FALLBACK)
    }
  }

  async function reject(): Promise<void> {
    const {
      candidate,
      session,
    } = runtime.value

    if (
      !session
      || !candidate
      || status.value !== EDITOR_AI_COMPOSER_STATUS.READY
    ) {
      clear()
      return
    }

    status.value = EDITOR_AI_COMPOSER_STATUS.REJECTING
    errorMessage.value = ''

    try {
      await rejectAiEditorCandidate(session.sessionId, candidate.candidateId)
      clear()
    }
    catch (error) {
      status.value = EDITOR_AI_COMPOSER_STATUS.FAILED
      errorMessage.value = getRequestErrorDisplayMessage(error, EDITOR_AI_REJECT_ERROR_FALLBACK)
    }
  }

  function clear(): void {
    abortController.value?.abort()
    abortController.value = null

    const editor = options.editor.value
    if (editor) {
      clearEditorAiPreview(editor)
    }

    activeDraft.value = null
    status.value = EDITOR_AI_COMPOSER_STATUS.IDLE
    prompt.value = ''
    previewText.value = ''
    errorMessage.value = ''
    acceptedWriteback.value = false
    runtime.value = {
      session: null,
      run: null,
      candidate: null,
    }
  }

  return {
    visible,
    mode,
    status,
    prompt,
    previewText,
    errorMessage,
    runtime,
    anchorStyle,
    canAccept,
    canReject,
    canSubmit,
    accept,
    clear,
    openGenerateFromKeyboard,
    openRewrite,
    reject,
    submit,
    updatePrompt,
  }

  function resolveDraft(mode: EditorAiComposerMode): EditorAiComposerDraft | null {
    const editor = options.editor.value
    const documentId = options.getDocumentId()

    if (!editor || !documentId) {
      return null
    }

    const resolved = mode === EDITOR_AI_COMPOSER_MODE.GENERATE
      ? resolveEditorAiGenerateAnchor(editor, documentId)
      : resolveEditorAiRewriteAnchor(editor, documentId)

    if (!resolved) {
      return null
    }

    return {
      mode,
      workflowKey: EDITOR_AI_WORKFLOW_KEY_BY_COMPOSER_MODE[mode],
      requestAnchor: resolved.requestAnchor,
      previewAnchor: resolved.previewAnchor,
      anchorStyle: resolveAnchorStyle(resolved.rect),
    }
  }

  function openDraft(draft: EditorAiComposerDraft): void {
    clear()
    activeDraft.value = draft
    status.value = EDITOR_AI_COMPOSER_STATUS.COMPOSING
  }

  async function openDraftWithModelCheck(draft: EditorAiComposerDraft): Promise<void> {
    if (isCheckingDefaultModel.value) {
      return
    }

    isCheckingDefaultModel.value = true

    try {
      if (await ensureDefaultModelReady(draft.mode)) {
        openDraft(draft)
      }
    }
    finally {
      isCheckingDefaultModel.value = false
    }
  }

  async function ensureDefaultModelReady(mode: EditorAiComposerMode): Promise<boolean> {
    const intentKey = EDITOR_AI_MODEL_INTENT_KEY_BY_COMPOSER_MODE[mode]

    try {
      const policies = await getAiDefaultModels()
      const effectivePolicy = resolveEffectiveAiDefaultModelPolicy(
        buildAiDefaultModelPolicyRecord(policies),
        intentKey,
      )

      if (isAiDefaultModelPolicyReady(effectivePolicy)) {
        return true
      }

      showAiDefaultModelMissingDialog({
        router,
        title: '文档 AI 默认模型未配置',
        message: effectivePolicy.invalidReason || getDefaultModelMissingMessage(mode),
        targetRouteName: getDefaultModelMissingTargetRouteName(effectivePolicy.invalidReason),
      })
      return false
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '检查文档 AI 默认模型失败'))
      return false
    }
  }

  function isActiveEditorAiRun(controller: AbortController, draft: EditorAiComposerDraft): boolean {
    return abortController.value === controller
      && activeDraft.value === draft
      && !controller.signal.aborted
  }
}

function getDefaultModelMissingMessage(mode: EditorAiComposerMode): string {
  if (mode === EDITOR_AI_COMPOSER_MODE.GENERATE) {
    return '请先配置文档默认模型，或为新内容生成、段落扩写单独配置模型。'
  }

  return '请先配置文档默认模型，或为润色、改写单独配置模型。'
}

function getDefaultModelMissingTargetRouteName(invalidReason: string | null) {
  return invalidReason?.includes('服务商') ? 'settings-providers' : 'settings-models-default'
}

function resolveCandidateContentText(candidate: EditorAiSessionRuntime['candidate']): string {
  if (!candidate) {
    return ''
  }

  return candidate.plainText?.trim() || candidate.contentText.trim()
}

function resolveAnchorStyle(rect: EditorAiAnchorRect): Record<string, string> {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const left = Math.max(
    EDITOR_AI_COMPOSER_VIEWPORT_PADDING,
    Math.min(
      rect.left,
      viewportWidth - EDITOR_AI_COMPOSER_WIDTH - EDITOR_AI_COMPOSER_VIEWPORT_PADDING,
    ),
  )
  const baseStyle = {
    left: `${left}px`,
    width: `${EDITOR_AI_COMPOSER_WIDTH}px`,
  }

  if (viewportHeight <= 0) {
    return {
      ...baseStyle,
      top: `${rect.bottom + EDITOR_AI_COMPOSER_ANCHOR_GAP}px`,
    }
  }

  const availableAboveHeight = Math.max(
    EDITOR_AI_COMPOSER_VIEWPORT_PADDING,
    rect.top - EDITOR_AI_COMPOSER_ANCHOR_GAP - EDITOR_AI_COMPOSER_VIEWPORT_PADDING,
  )

  return {
    ...baseStyle,
    bottom: `${viewportHeight - rect.top + EDITOR_AI_COMPOSER_ANCHOR_GAP}px`,
    maxHeight: `${availableAboveHeight}px`,
  }
}
