import type { BubbleToolbarAction } from './actionRegistry'

interface BubbleToolbarActionState {
  active: boolean
  disabled: boolean
}

type BubbleToolbarActionContent
  = | {
    kind: 'text'
    value: string
    style: BubbleToolbarTextStyle
  }
  | {
    kind: 'icon'
    icon: string
  }

type BubbleToolbarGroupItem
  = BubbleToolbarComponentItem | BubbleToolbarActionItem

type BubbleToolbarComponent = 'turn-into' | 'color' | 'align'

export type BubbleToolbarVariant = 'text' | 'image'
export type BubbleToolbarTextStyle = 'mark-strong' | 'mark-italic' | 'mark-underline' | 'mark-strike' | 'label'

interface BubbleToolbarComponentItem {
  kind: 'component'
  component: BubbleToolbarComponent
  description?: string
}

interface BubbleToolbarActionItem {
  kind: 'action'
  action: BubbleToolbarAction
  description?: string
  content: BubbleToolbarActionContent
  buttonVariant?: 'default' | 'wide'
}

export interface BubbleToolbarGroup {
  key: string
  items: readonly BubbleToolbarGroupItem[]
}

export type BubbleToolbarViewGroupItem
  = BubbleToolbarComponentItem
    | (BubbleToolbarActionItem & BubbleToolbarActionState)

export type BubbleToolbarViewGroup = Omit<BubbleToolbarGroup, 'items'> & {
  items: readonly BubbleToolbarViewGroupItem[]
}

const TEXT_BUBBLE_TOOLBAR_GROUPS = [
  {
    key: 'text',
    items: [
      {
        kind: 'component',
        component: 'turn-into',
        description: '文本',
      },
    ],
  },
  {
    key: 'align',
    items: [
      {
        kind: 'component',
        component: 'align',
        description: '缩进和对齐',
      },
    ],
  },
  {
    key: 'marks',
    items: [
      {
        kind: 'action',
        action: 'bold',
        description: '加粗',
        content: {
          kind: 'text',
          value: 'B',
          style: 'mark-strong',
        },
      },
      {
        kind: 'action',
        action: 'italic',
        description: '斜体',
        content: {
          kind: 'text',
          value: 'I',
          style: 'mark-italic',
        },
      },
      {
        kind: 'action',
        action: 'underline',
        description: '下划线',
        content: {
          kind: 'text',
          value: 'U',
          style: 'mark-underline',
        },
      },
      {
        kind: 'action',
        action: 'strike',
        description: '删除线',
        content: {
          kind: 'text',
          value: 'S',
          style: 'mark-strike',
        },
      },
      {
        kind: 'action',
        action: 'code',
        description: '代码',
        content: {
          kind: 'icon',
          icon: 'code',
        },
      },
    ],
  },
  {
    key: 'link',
    items: [
      {
        kind: 'action',
        action: 'link',
        description: '链接',
        content: {
          kind: 'icon',
          icon: 'link',
        },
      },
    ],
  },
  {
    key: 'color',
    items: [
      {
        kind: 'component',
        component: 'color',
        description: '颜色',
      },
    ],
  },
  {
    key: 'selection-context',
    items: [
      {
        kind: 'action',
        action: 'add-selection-context',
        description: '加入对话上下文',
        content: {
          kind: 'text',
          value: '加入对话',
          style: 'label',
        },
        buttonVariant: 'wide',
      },
    ],
  },
  {
    key: 'comment',
    items: [
      {
        kind: 'action',
        action: 'comment',
        description: '评论',
        content: {
          kind: 'icon',
          icon: 'comment',
        },
      },
    ],
  },
] as const satisfies readonly BubbleToolbarGroup[]

const IMAGE_BUBBLE_TOOLBAR_GROUPS = [
  {
    key: 'image-alt',
    items: [
      {
        kind: 'action',
        action: 'edit-image-alt',
        description: '编辑描述',
        content: {
          kind: 'text',
          value: '编辑描述',
          style: 'label',
        },
        buttonVariant: 'wide',
      },
    ],
  },
  {
    key: 'image-align',
    items: [
      {
        kind: 'action',
        action: 'align-left',
        description: '左对齐',
        content: {
          kind: 'text',
          value: '左对齐',
          style: 'label',
        },
        buttonVariant: 'wide',
      },
      {
        kind: 'action',
        action: 'align-center',
        description: '居中对齐',
        content: {
          kind: 'text',
          value: '居中对齐',
          style: 'label',
        },
        buttonVariant: 'wide',
      },
      {
        kind: 'action',
        action: 'align-right',
        description: '右对齐',
        content: {
          kind: 'text',
          value: '右对齐',
          style: 'label',
        },
        buttonVariant: 'wide',
      },
    ],
  },
  {
    key: 'image-comment',
    items: [
      {
        kind: 'action',
        action: 'comment',
        description: '评论',
        content: {
          kind: 'text',
          value: '评论',
          style: 'label',
        },
        buttonVariant: 'wide',
      },
    ],
  },
] as const satisfies readonly BubbleToolbarGroup[]

export function getBubbleToolbarViewGroups(
  variant: BubbleToolbarVariant,
  getActionState: (action: BubbleToolbarAction) => BubbleToolbarActionState,
): BubbleToolbarViewGroup[] {
  const groups = variant === 'image'
    ? IMAGE_BUBBLE_TOOLBAR_GROUPS
    : TEXT_BUBBLE_TOOLBAR_GROUPS

  return groups.map(group => ({
    ...group,
    items: group.items.map((item) => {
      if (item.kind === 'component') {
        return item
      }

      return {
        ...item,
        ...getActionState(item.action),
      }
    }),
  }))
}
