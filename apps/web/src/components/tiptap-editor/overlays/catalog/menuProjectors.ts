import type { Editor } from '@tiptap/core'
import type { TurnIntoBlockType } from '../../commands/turnInto'
import type {
  BlockMenuChildItem,
  BlockMenuItem,
  BlockMenuModel,
  BlockMenuQuickItem,
  BlockMenuTurnIntoQuickItem,
  BlockMenuVariantDefinition,
  BlockMenuVariantQuickDefinition,
  BlockTriggerViewState,
  EditorBlockMenuContext,
  TurnIntoMenuDefinition,
  TurnIntoMenuItem,
  TurnIntoMenuScope,
  TurnIntoMenuTarget,
} from './menuCatalog'
import { getCurrentBlock } from '../../commands/currentBlock'
import {
  canIndentBlock,
  canOutdentBlock,
  getCurrentHighlightClass,
  getCurrentTextAlign,
  getCurrentTextColorClass,
} from '../../commands/editorActions'
import { isTurnIntoBlockActive } from '../../extensions/BlockCommands'
import {
  BLOCK_MENU_INDENT_CHILD_REGISTRY,
  BLOCK_MENU_TEXT_ALIGN_CHILD_REGISTRY,
  BLOCK_MENU_VARIANT_REGISTRY,
  BLOCK_TRIGGER_TURN_INTO_ROW_REGISTRY,
  BUBBLE_TURN_INTO_GROUP_REGISTRY,
  TURN_INTO_ITEM_CATALOG,
  TURN_INTO_SCOPE_REGISTRY,
} from './menuCatalog'

export function getTurnIntoMenuItems(
  editor: Editor,
  scope: TurnIntoMenuScope,
): TurnIntoMenuItem[] {
  return projectTurnIntoMenuTargets(editor, TURN_INTO_SCOPE_REGISTRY[scope])
}

export function getBubbleTurnIntoGroups(editor: Editor): TurnIntoMenuItem[][] {
  return BUBBLE_TURN_INTO_GROUP_REGISTRY.map(group => projectTurnIntoMenuTargets(editor, group))
}

export function groupBlockTurnIntoQuickItems(
  quickItems: readonly BlockMenuQuickItem[],
): BlockMenuTurnIntoQuickItem[][] {
  const turnIntoItemMap = new Map(
    quickItems
      .filter((item): item is BlockMenuTurnIntoQuickItem => item.kind === 'turn-into')
      .map(item => [item.target, item]),
  )

  return BLOCK_TRIGGER_TURN_INTO_ROW_REGISTRY
    .map(targets => targets
      .map(target => turnIntoItemMap.get(target))
      .filter((item): item is BlockMenuTurnIntoQuickItem => Boolean(item)))
    .filter(items => items.length > 0)
}

export function getEditorBlockMenuContext(editor: Editor): EditorBlockMenuContext {
  const currentBlock = getCurrentBlock(editor.state.selection)
  const textContent = currentBlock?.node.textContent ?? editor.state.selection.$from.parent.textContent ?? ''
  const blockTarget = resolveCurrentBlockTarget(currentBlock)
  const isEmptyText = textContent.trim().length === 0

  return {
    blockTarget,
    textContent,
    isEditable: editor.isEditable,
    isEmptyBlock: blockTarget === 'paragraph' && isEmptyText,
    canIndent: canIndentBlock(editor),
    canOutdent: canOutdentBlock(editor),
    textAlign: getCurrentTextAlign(editor),
  }
}

export function getBlockMenuModel(editor: Editor): BlockMenuModel {
  const context = getEditorBlockMenuContext(editor)
  return projectBlockMenuModel(editor, context)
}

export function getAlignMenuItems(editor: Editor): BlockMenuChildItem[] {
  return projectAlignChildren(getEditorBlockMenuContext(editor))
}

export function getBlockTriggerViewState(editor: Editor): BlockTriggerViewState {
  const context = getEditorBlockMenuContext(editor)
  const model = projectBlockMenuModel(editor, context)
  const triggerDefinition = TURN_INTO_ITEM_CATALOG[context.blockTarget]

  return {
    model,
    alignItems: getAlignMenuItems(editor),
    currentTextColor: getActiveTextColor(editor),
    currentBackgroundColor: getActiveHighlightColor(editor),
    currentTriggerIcon: context.isEmptyBlock ? '+' : triggerDefinition.icon,
    currentTriggerLabel: context.isEmptyBlock ? '插入块' : triggerDefinition.label,
    canDrag: canDragCurrentBlock(context),
  }
}

export function getActiveTextColor(editor: Editor): string {
  return getCurrentTextColorClass(editor)
}

export function getActiveHighlightColor(editor: Editor): string {
  return getCurrentHighlightClass(editor)
}

function projectBlockMenuModel(editor: Editor, context: EditorBlockMenuContext): BlockMenuModel {
  const variant = context.isEmptyBlock
    ? BLOCK_MENU_VARIANT_REGISTRY.empty
    : BLOCK_MENU_VARIANT_REGISTRY.content

  return {
    quickItems: variant.quickItems.flatMap(definition => projectBlockMenuQuickItems(editor, definition)),
    menuItems: variant.menuItems.map(definition => projectBlockMenuItem(context, definition)),
  }
}

function resolveCurrentBlockTarget(currentBlock: ReturnType<typeof getCurrentBlock>): TurnIntoBlockType {
  if (!currentBlock) {
    return 'paragraph'
  }

  switch (currentBlock.node.type.name) {
    case 'heading':
      return resolveHeadingTarget(currentBlock.node.attrs?.level)
    case 'listItem':
      return currentBlock.parent.type.name === 'orderedList' ? 'orderedList' : 'bulletList'
    case 'taskItem':
      return 'taskList'
    case 'blockquote':
      return 'blockquote'
    case 'codeBlock':
      return 'codeBlock'
    case 'horizontalRule':
      return 'divider'
    default:
      return 'paragraph'
  }
}

function resolveHeadingTarget(level: unknown): TurnIntoBlockType {
  switch (level) {
    case 2:
      return 'heading-2'
    case 3:
      return 'heading-3'
    case 4:
      return 'heading-4'
    case 5:
      return 'heading-5'
    default:
      return 'heading-1'
  }
}

function canDragCurrentBlock(context: EditorBlockMenuContext) {
  return context.blockTarget === 'divider' || context.textContent.trim().length > 0
}

function projectBlockMenuQuickItems(
  editor: Editor,
  definition: BlockMenuVariantQuickDefinition,
): BlockMenuQuickItem[] {
  if (definition.kind === 'turn-into-scope') {
    return getTurnIntoMenuItems(editor, definition.scope).map(toTurnIntoQuickItem)
  }

  return [
    {
      label: definition.label,
      icon: definition.icon,
      kind: definition.action,
    },
  ]
}

function projectBlockMenuItem(
  context: EditorBlockMenuContext,
  definition: BlockMenuVariantDefinition['menuItems'][number],
): BlockMenuItem {
  if (definition.kind === 'panel') {
    if (definition.action === 'align') {
      return {
        ...definition,
        children: projectAlignChildren(context),
      }
    }

    return {
      label: definition.label,
      icon: definition.icon,
      kind: 'panel',
      action: 'color',
    }
  }

  return definition
}

function projectAlignChildren(context: EditorBlockMenuContext): BlockMenuChildItem[] {
  return [
    ...BLOCK_MENU_TEXT_ALIGN_CHILD_REGISTRY.map(definition => ({
      label: definition.label,
      icon: definition.icon,
      kind: 'text-align' as const,
      action: definition.action,
      isActive: context.textAlign === definition.value,
    })),
    ...BLOCK_MENU_INDENT_CHILD_REGISTRY.map(definition => ({
      label: definition.label,
      icon: definition.icon,
      kind: 'indent' as const,
      action: definition.action,
      disabled: definition.isDisabled(context),
    })),
  ]
}

function toTurnIntoMenuItem(editor: Editor, target: TurnIntoMenuTarget): TurnIntoMenuItem {
  const definition = resolveTurnIntoMenuDefinition(target)

  return {
    ...definition,
    isActive: isTurnIntoBlockActive(editor, definition.target),
  }
}

function projectTurnIntoMenuTargets(
  editor: Editor,
  targets: readonly TurnIntoMenuTarget[],
): TurnIntoMenuItem[] {
  return targets.map(target => toTurnIntoMenuItem(editor, target))
}

function toTurnIntoQuickItem(item: TurnIntoMenuItem): BlockMenuTurnIntoQuickItem {
  return {
    ...item,
    kind: 'turn-into',
  }
}

function resolveTurnIntoMenuDefinition(target: TurnIntoMenuTarget): TurnIntoMenuDefinition {
  const blockType = typeof target === 'string' ? target : target.target
  const baseDefinition = TURN_INTO_ITEM_CATALOG[blockType]

  if (typeof target === 'string') {
    return {
      ...baseDefinition,
      target: blockType,
    }
  }

  return {
    label: target.label ?? baseDefinition.label,
    icon: target.icon ?? baseDefinition.icon,
    target: blockType,
  }
}
