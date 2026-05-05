import type { TurnIntoBlockType } from '../../commands/turnInto'
import type {
  BlockMenuAlignAction,
  BlockMenuLeafAction,
  BlockMenuQuickAction,
  TextAlignAction,
} from './actionRegistry'

export type { BlockMenuAlignAction, BlockMenuQuickAction, TextAlignAction } from './actionRegistry'

export type BlockMenuTextAlign = 'left' | 'center' | 'right'
export type BlockMenuPanelAction = 'align' | 'color'
export type BlockMenuAction = BlockMenuPanelAction | BlockMenuLeafAction

/** 菜单颜色项 */
export interface MenuColorOption {
  label: string
  className: string
}

/** 块转换菜单项 */
export interface TurnIntoMenuItem {
  label: string
  icon: string
  target: TurnIntoBlockType
  isActive: boolean
}

export interface TurnIntoMenuDefinition extends Omit<TurnIntoMenuItem, 'isActive'> {}
export type TurnIntoMenuScope = 'block-content' | 'block-empty'

export type TurnIntoMenuTarget = TurnIntoBlockType | ({
  target: TurnIntoBlockType
} & Partial<Omit<TurnIntoMenuDefinition, 'target'>>)

/** 块菜单上下文 */
export interface EditorBlockMenuContext {
  blockTarget: TurnIntoBlockType
  textContent: string
  isEditable: boolean
  isEmptyBlock: boolean
  canIndent: boolean
  canOutdent: boolean
  textAlign: BlockMenuTextAlign
}

/** 块菜单快捷插入项 */
export interface BlockMenuInsertQuickItem {
  label: string
  icon: string
  kind: Exclude<BlockMenuQuickAction, 'turn-into'>
}

/** 块菜单块转换快捷项 */
export interface BlockMenuTurnIntoQuickItem {
  label: string
  icon: string
  kind: 'turn-into'
  isActive: boolean
  target: TurnIntoBlockType
}

export type BlockMenuQuickItem = BlockMenuTurnIntoQuickItem | BlockMenuInsertQuickItem

/** 块菜单对齐二级项 */
export interface BlockMenuTextAlignChildItem {
  label: string
  icon: string
  kind: 'text-align'
  action: TextAlignAction
  isActive: boolean
}

/** 块菜单缩进二级项 */
export interface BlockMenuIndentChildItem {
  label: string
  icon: string
  kind: 'indent'
  action: Exclude<BlockMenuAlignAction, TextAlignAction>
  disabled: boolean
}

export type BlockMenuChildItem = BlockMenuTextAlignChildItem | BlockMenuIndentChildItem

/** 块菜单行为项 */
export interface BlockMenuActionItem {
  label: string
  icon: string
  kind: 'action'
  action: BlockMenuLeafAction
}

/** 块菜单对齐面板项 */
export interface BlockMenuAlignPanelItem {
  label: string
  icon: string
  kind: 'panel'
  action: 'align'
  children: BlockMenuChildItem[]
}

/** 块菜单颜色面板项 */
export interface BlockMenuColorPanelItem {
  label: string
  icon: string
  kind: 'panel'
  action: 'color'
}

export type BlockMenuPanelItem = BlockMenuAlignPanelItem | BlockMenuColorPanelItem
export type BlockMenuItem = BlockMenuPanelItem | BlockMenuActionItem

/** 块菜单模型 */
export interface BlockMenuModel {
  quickItems: BlockMenuQuickItem[]
  menuItems: BlockMenuItem[]
}

/** 块触发菜单视图状态 */
export interface BlockTriggerViewState {
  model: BlockMenuModel
  alignItems: BlockMenuChildItem[]
  currentTextColor: string
  currentBackgroundColor: string
  currentTriggerIcon: string
  currentTriggerLabel: string
  canDrag: boolean
}

export interface BlockMenuActionDefinition {
  label: string
  icon: string
  action: BlockMenuLeafAction
  kind: 'action'
}

export interface BlockMenuPanelDefinition {
  label: string
  icon: string
  action: BlockMenuPanelAction
  kind: 'panel'
}

export interface BlockMenuTextAlignDefinition {
  label: string
  icon: string
  action: TextAlignAction
  value: BlockMenuTextAlign
}

export interface BlockMenuIndentDefinition {
  label: string
  icon: string
  action: Exclude<BlockMenuAlignAction, TextAlignAction>
  isDisabled: (context: EditorBlockMenuContext) => boolean
}

export type BlockMenuVariantQuickDefinition
  = | {
    kind: 'turn-into-scope'
    scope: Extract<TurnIntoMenuScope, 'block-content' | 'block-empty'>
  }
  | {
    kind: 'insert'
    label: string
    icon: string
    action: BlockMenuInsertQuickItem['kind']
  }

export interface BlockMenuVariantDefinition {
  quickItems: readonly BlockMenuVariantQuickDefinition[]
  menuItems: readonly (BlockMenuPanelDefinition | BlockMenuActionDefinition)[]
}

export const textColorOptions = [
  { label: '默认', className: '' },
  { label: '灰色', className: 'tiptap-highlight-gray-text' },
  { label: '棕色', className: 'tiptap-highlight-brown-text' },
  { label: '橙色', className: 'tiptap-highlight-orange-text' },
  { label: '黄色', className: 'tiptap-highlight-yellow-text' },
  { label: '绿色', className: 'tiptap-highlight-green-text' },
  { label: '蓝色', className: 'tiptap-highlight-blue-text' },
  { label: '紫色', className: 'tiptap-highlight-purple-text' },
  { label: '粉色', className: 'tiptap-highlight-pink-text' },
  { label: '红色', className: 'tiptap-highlight-red-text' },
] as const satisfies readonly MenuColorOption[]

export const backgroundColorOptions = [
  { label: '默认', className: '' },
  { label: '灰色', className: 'tiptap-highlight-gray-bg' },
  { label: '棕色', className: 'tiptap-highlight-brown-bg' },
  { label: '橙色', className: 'tiptap-highlight-orange-bg' },
  { label: '黄色', className: 'tiptap-highlight-yellow-bg' },
  { label: '绿色', className: 'tiptap-highlight-green-bg' },
  { label: '蓝色', className: 'tiptap-highlight-blue-bg' },
  { label: '紫色', className: 'tiptap-highlight-purple-bg' },
  { label: '粉色', className: 'tiptap-highlight-pink-bg' },
  { label: '红色', className: 'tiptap-highlight-red-bg' },
] as const satisfies readonly MenuColorOption[]

export const TURN_INTO_ITEM_CATALOG = {
  'paragraph': { label: '正文', icon: 'T' },
  'heading-1': { label: '一级标题', icon: 'H1' },
  'heading-2': { label: '二级标题', icon: 'H2' },
  'heading-3': { label: '三级标题', icon: 'H3' },
  'heading-4': { label: '四级标题', icon: 'H4' },
  'heading-5': { label: '五级标题', icon: 'H5' },
  'bulletList': { label: '无序列表', icon: 'list-ul' },
  'orderedList': { label: '有序列表', icon: 'list-ol' },
  'codeBlock': { label: '代码块', icon: 'code' },
  'blockquote': { label: '引用', icon: 'quote' },
  'divider': { label: '分割线', icon: 'divider' },
  'taskList': { label: '任务列表', icon: 'task' },
} as const satisfies Record<TurnIntoBlockType, Omit<TurnIntoMenuDefinition, 'target'>>

export const BUBBLE_TURN_INTO_GROUP_REGISTRY = [
  [
    'paragraph',
    'heading-1',
    'heading-2',
    'heading-3',
  ],
  [
    'bulletList',
    'orderedList',
    'taskList',
  ],
  [
    'blockquote',
  ],
] as const satisfies readonly (readonly TurnIntoBlockType[])[]

export const BLOCK_TRIGGER_TURN_INTO_ROW_REGISTRY = [
  [
    'paragraph',
    'heading-1',
    'heading-2',
    'heading-3',
    'heading-4',
    'heading-5',
  ],
  [
    'bulletList',
    'orderedList',
    'taskList',
  ],
  [
    'codeBlock',
    'blockquote',
  ],
] as const satisfies readonly (readonly TurnIntoBlockType[])[]

export const TURN_INTO_SCOPE_REGISTRY = {
  'block-content': [
    'paragraph',
    'heading-1',
    'heading-2',
    'heading-3',
    'heading-4',
    'heading-5',
    'bulletList',
    'orderedList',
    'taskList',
    'codeBlock',
    'blockquote',
  ],
  'block-empty': [
    'heading-1',
    'heading-2',
    'heading-3',
    'bulletList',
    'orderedList',
    'taskList',
    'codeBlock',
    'blockquote',
    'divider',
  ],
} as const satisfies Record<TurnIntoMenuScope, readonly TurnIntoMenuTarget[]>

export const BLOCK_MENU_VARIANT_REGISTRY = {
  empty: {
    quickItems: [
      { kind: 'turn-into-scope', scope: 'block-empty' },
      { kind: 'insert', label: '链接', icon: 'link', action: 'insert-link' },
      { kind: 'insert', label: '图片', icon: 'image', action: 'insert-image' },
      { kind: 'insert', label: '视频或文件', icon: 'file', action: 'insert-file' },
    ],
    menuItems: [],
  },
  content: {
    quickItems: [
      { kind: 'turn-into-scope', scope: 'block-content' },
    ],
    menuItems: [
      { label: '缩进和对齐', icon: 'align', action: 'align', kind: 'panel' },
      { label: '颜色', icon: 'color', action: 'color', kind: 'panel' },
      { label: '评论', icon: 'comment', action: 'comment', kind: 'action' },
      { label: '剪切', icon: 'cut', action: 'cut', kind: 'action' },
      { label: '复制', icon: 'copy', action: 'copy', kind: 'action' },
      { label: '删除', icon: 'delete', action: 'delete', kind: 'action' },
    ],
  },
} as const satisfies Record<'empty' | 'content', BlockMenuVariantDefinition>

export const BLOCK_MENU_TEXT_ALIGN_CHILD_REGISTRY = [
  { label: '左对齐', icon: 'align-left', action: 'align-left', value: 'left' },
  { label: '居中对齐', icon: 'align-center', action: 'align-center', value: 'center' },
  { label: '右对齐', icon: 'align-right', action: 'align-right', value: 'right' },
] as const satisfies readonly BlockMenuTextAlignDefinition[]

export const BLOCK_MENU_INDENT_CHILD_REGISTRY = [
  { label: '增加缩进', icon: 'indent', action: 'indent', isDisabled: context => !context.canIndent },
  { label: '减少缩进', icon: 'outdent', action: 'outdent', isDisabled: context => !context.canOutdent },
] as const satisfies readonly BlockMenuIndentDefinition[]
