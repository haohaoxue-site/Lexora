import type { DocsDocumentEditorFallbackProps } from '../typing'
import { DOCUMENT_PANE_STATE } from '@haohaoxue/samepage-contracts'
import { SvgIconCategory } from '@/components/svg-icon/typing'

/**
 * 回退态操作。
 */
export interface DocumentEditorFallbackAction {
  event: 'createDocument' | 'openFallbackDocument' | 'retryLoad'
  label: string
  type?: 'primary' | 'default'
}

/**
 * 回退态展示数据。
 */
export interface DocumentEditorFallbackState {
  title: string
  description: string
  iconCategory: SvgIconCategory
  icon: string
  spin?: boolean
  actions: DocumentEditorFallbackAction[]
}

export function resolveDocumentEditorFallbackState(
  props: DocsDocumentEditorFallbackProps,
): DocumentEditorFallbackState {
  if (props.contentError) {
    return {
      title: '文档内容暂时无法打开',
      description: props.hasFallbackDocument
        ? '这篇文档当前无法在编辑器中恢复，你可以重新加载，或先打开其他可用文档。'
        : '这篇文档当前无法在编辑器中恢复，你可以重新加载后再试。',
      iconCategory: SvgIconCategory.UI,
      icon: 'warning',
      actions: [
        {
          event: 'retryLoad',
          label: '重新加载',
          type: 'primary',
        },
        ...(
          props.hasFallbackDocument
            ? [{
                event: 'openFallbackDocument' as const,
                label: '打开可用文档',
              }]
            : []
        ),
      ],
    }
  }

  if (props.paneState === DOCUMENT_PANE_STATE.LOADING) {
    return {
      title: '正在准备文档',
      description: props.isLoading ? '正在加载当前文档，请稍候。' : '正在恢复最近打开的内容，请稍候。',
      iconCategory: SvgIconCategory.UI,
      icon: 'spinner-orbit',
      spin: true,
      actions: [],
    }
  }

  if (props.paneState === DOCUMENT_PANE_STATE.EMPTY) {
    return {
      title: '还没有文档',
      description: '先创建第一篇文档，之后进入工作区会自动回到最近内容。',
      iconCategory: SvgIconCategory.UI,
      icon: 'document-add',
      actions: [
        {
          event: 'createDocument',
          label: '新建第一篇文档',
          type: 'primary',
        },
      ],
    }
  }

  if (props.paneState === DOCUMENT_PANE_STATE.UNSUPPORTED_SCHEMA) {
    return {
      title: '文档 schema 版本不受支持',
      description: props.hasFallbackDocument
        ? '当前工作区版本无法打开这篇文档，你可以先切到其他可用文档继续工作。'
        : '当前工作区版本无法打开这篇文档，请刷新或升级后再试。你也可以先新建其他文档继续工作。',
      iconCategory: SvgIconCategory.UI,
      icon: 'warning',
      actions: props.hasFallbackDocument
        ? [
            {
              event: 'openFallbackDocument',
              label: '打开可用文档',
              type: 'primary',
            },
          ]
        : [
            {
              event: 'createDocument',
              label: '新建文档',
              type: 'primary',
            },
          ],
    }
  }

  if (props.paneState === DOCUMENT_PANE_STATE.NOT_FOUND) {
    return {
      title: '文档不存在',
      description: '这个链接可能已经失效，或者文档已被删除。',
      iconCategory: SvgIconCategory.UI,
      icon: 'document-unknown',
      actions: props.hasFallbackDocument
        ? [
            {
              event: 'openFallbackDocument',
              label: '打开可用文档',
              type: 'primary',
            },
          ]
        : [
            {
              event: 'createDocument',
              label: '新建文档',
              type: 'primary',
            },
          ],
    }
  }

  if (props.paneState === DOCUMENT_PANE_STATE.FORBIDDEN) {
    return {
      title: '无权访问这篇文档',
      description: '你可以先回到其他可访问的文档继续工作。',
      iconCategory: SvgIconCategory.UI,
      icon: 'lock',
      actions: props.hasFallbackDocument
        ? [
            {
              event: 'openFallbackDocument',
              label: '打开可用文档',
              type: 'primary',
            },
          ]
        : [],
    }
  }

  if (props.paneState === DOCUMENT_PANE_STATE.ERROR) {
    return {
      title: '文档加载失败',
      description: '当前内容暂时无法打开，你可以重试或先回到其他文档。',
      iconCategory: SvgIconCategory.UI,
      icon: 'warning',
      actions: [
        {
          event: 'retryLoad',
          label: '重新加载',
          type: 'primary',
        },
        ...(
          props.hasFallbackDocument
            ? [{
                event: 'openFallbackDocument' as const,
                label: '打开可用文档',
              }]
            : []
        ),
      ],
    }
  }

  return {
    title: '选择一篇文档',
    description: '已进入文档工作区，先打开一篇文档再开始编辑。',
    iconCategory: SvgIconCategory.UI,
    icon: 'document-view',
    actions: props.hasFallbackDocument
      ? [
          {
            event: 'openFallbackDocument',
            label: '打开第一篇文档',
            type: 'primary',
          },
        ]
      : [
          {
            event: 'createDocument',
            label: '新建文档',
            type: 'primary',
          },
        ],
  }
}
