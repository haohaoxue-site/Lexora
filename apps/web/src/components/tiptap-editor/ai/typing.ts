import type { AiAnchor, AiCandidate, AiEditorWorkflowKey, AiRun, AiSession } from '@haohaoxue/samepage-contracts'
import type {
  EDITOR_AI_COMPOSER_BUSY_BY_STATUS,
  EDITOR_AI_COMPOSER_CLOSE_LABEL_BY_STATUS,
  EDITOR_AI_COMPOSER_MODE,
  EDITOR_AI_COMPOSER_PLACEHOLDER_BY_MODE,
  EDITOR_AI_COMPOSER_STATUS,
  EDITOR_AI_COMPOSER_SUBMIT_LABEL_BY_MODE,
  EDITOR_AI_COMPOSER_SUBMIT_LABEL_BY_STATUS,
  EDITOR_AI_PREVIEW_EMPTY_TEXT_BY_STATUS,
  EDITOR_AI_PREVIEW_STATUS,
  EDITOR_AI_WORKFLOW_KEY_BY_COMPOSER_MODE,
} from './contracts'

export type EditorAiComposerMode = typeof EDITOR_AI_COMPOSER_MODE[keyof typeof EDITOR_AI_COMPOSER_MODE]
export type EditorAiComposerStatus = typeof EDITOR_AI_COMPOSER_STATUS[keyof typeof EDITOR_AI_COMPOSER_STATUS]
export type EditorAiPreviewStatus = typeof EDITOR_AI_PREVIEW_STATUS[keyof typeof EDITOR_AI_PREVIEW_STATUS]

type EditorAiStrictRecord<T extends Record<Keys, Value>, Keys extends PropertyKey, Value> = T

export type EditorAiWorkflowKeyByComposerMode = EditorAiStrictRecord<
  typeof EDITOR_AI_WORKFLOW_KEY_BY_COMPOSER_MODE,
  EditorAiComposerMode,
  AiEditorWorkflowKey
>
export type EditorAiComposerPlaceholderByMode = EditorAiStrictRecord<
  typeof EDITOR_AI_COMPOSER_PLACEHOLDER_BY_MODE,
  EditorAiComposerMode,
  string
>
export type EditorAiComposerSubmitLabelByMode = EditorAiStrictRecord<
  typeof EDITOR_AI_COMPOSER_SUBMIT_LABEL_BY_MODE,
  EditorAiComposerMode,
  string
>
export type EditorAiComposerSubmitLabelByStatus = EditorAiStrictRecord<
  typeof EDITOR_AI_COMPOSER_SUBMIT_LABEL_BY_STATUS,
  EditorAiComposerStatus,
  string | null
>
export type EditorAiComposerCloseLabelByStatus = EditorAiStrictRecord<
  typeof EDITOR_AI_COMPOSER_CLOSE_LABEL_BY_STATUS,
  EditorAiComposerStatus,
  string
>
export type EditorAiComposerBusyByStatus = EditorAiStrictRecord<
  typeof EDITOR_AI_COMPOSER_BUSY_BY_STATUS,
  EditorAiComposerStatus,
  boolean
>
export type EditorAiPreviewEmptyTextByStatus = EditorAiStrictRecord<
  typeof EDITOR_AI_PREVIEW_EMPTY_TEXT_BY_STATUS,
  EditorAiPreviewStatus,
  string
>

export type EditorAiAnchorRect = Pick<DOMRect, 'bottom' | 'left' | 'right' | 'top'>

export type EditorAiPreviewAnchor
  = | {
    kind: 'block-insert'
    from: number
    to: number
  }
  | {
    kind: 'text-selection'
    from: number
    to: number
  }

export interface EditorAiComposerDraft {
  mode: EditorAiComposerMode
  workflowKey: AiEditorWorkflowKey
  requestAnchor: AiAnchor
  previewAnchor: EditorAiPreviewAnchor
  anchorStyle: Record<string, string>
}

export interface EditorAiSessionRuntime {
  session: AiSession | null
  run: AiRun | null
  candidate: AiCandidate | null
}
