import type { CommandProps, Editor } from '@tiptap/core'
import type { CurrentBlockSelection } from '../commands/currentBlock'
import type { TurnIntoBlockType } from '../commands/turnInto'
import { Extension } from '@tiptap/core'
import { Selection } from '@tiptap/pm/state'
import { findBlockById, getCurrentBlock } from '../commands/currentBlock'

type HeadingTurnIntoBlockType = Extract<TurnIntoBlockType, 'heading-1' | 'heading-2' | 'heading-3' | 'heading-4' | 'heading-5'>
type BlockCommandContext = Pick<CommandProps, 'commands' | 'editor'>
const EMPTY_STORED_MARKS: [] = []
const SPLIT_MERGE_EXCLUDED_NODE_NAMES = new Set([
  'blockquote',
  'bulletList',
  'orderedList',
  'taskList',
  'listItem',
  'taskItem',
  'codeBlock',
])

const HEADING_LEVEL_BY_TARGET: Record<HeadingTurnIntoBlockType, 1 | 2 | 3 | 4 | 5> = {
  'heading-1': 1,
  'heading-2': 2,
  'heading-3': 3,
  'heading-4': 4,
  'heading-5': 5,
}

export const BlockCommands = Extension.create({
  name: 'BlockCommands',
  priority: 1_000,

  addCommands() {
    return {
      turnIntoBlock: target => (props) => {
        switch (target) {
          case 'paragraph':
            return turnIntoParagraph(props)
          case 'heading-1':
          case 'heading-2':
          case 'heading-3':
          case 'heading-4':
          case 'heading-5':
            return turnIntoHeading(props, HEADING_LEVEL_BY_TARGET[target])
          case 'bulletList':
            return turnIntoBulletList(props)
          case 'orderedList':
            return turnIntoOrderedList(props)
          case 'codeBlock':
            return turnIntoCodeBlock(props)
          case 'blockquote':
            return turnIntoBlockquote(props)
          case 'divider':
            return turnIntoDivider(props)
          case 'taskList':
            return turnIntoTaskList(props)
        }
      },
      indentBlock: () => (props) => {
        const listItemType = getActiveListItemType(props.editor)

        if (!listItemType || !canIndentCurrentListItem(props.editor, listItemType)) {
          return false
        }

        return props.commands.sinkListItem(listItemType)
      },
      outdentBlock: () => (props) => {
        const listItemType = getActiveListItemType(props.editor)

        if (!listItemType) {
          return false
        }

        return props.commands.liftListItem(listItemType)
      },
      moveBlockUp: () => (props: CommandProps) => moveCurrentBlock(props, 'up'),
      moveBlockDown: () => (props: CommandProps) => moveCurrentBlock(props, 'down'),
      moveCurrentBlockTo: (targetBlockId, placement) => (props: CommandProps) =>
        moveCurrentBlockTo(props, targetBlockId, placement),
      insertBlock: () => (props: CommandProps) => insertBlockAfterCurrent(props),
      deleteBlock: () => (props: CommandProps) => deleteCurrentBlock(props),
      duplicateBlock: () => (props: CommandProps) => duplicateCurrentBlock(props),
      splitCurrentBlock: () => (props: CommandProps) => splitCurrentBlock(props),
      mergeBlockBackward: () => (props: CommandProps) => mergeBlockBackward(props),
    }
  },

  addKeyboardShortcuts() {
    return {
      'Enter': () => this.editor.commands.splitCurrentBlock(),
      'Backspace': () => this.editor.commands.mergeBlockBackward(),
      'Alt-Shift-ArrowUp': () => this.editor.commands.moveBlockUp(),
      'Alt-Shift-ArrowDown': () => this.editor.commands.moveBlockDown(),
    }
  },
})

export function isTurnIntoBlockActive(editor: Editor, target: TurnIntoBlockType) {
  switch (target) {
    case 'paragraph':
      return isPlainParagraphActive(editor)
    case 'heading-1':
    case 'heading-2':
    case 'heading-3':
    case 'heading-4':
    case 'heading-5':
      return editor.isActive('heading', {
        level: HEADING_LEVEL_BY_TARGET[target],
      })
    case 'bulletList':
      return editor.isActive('bulletList')
    case 'orderedList':
      return editor.isActive('orderedList')
    case 'codeBlock':
      return editor.isActive('codeBlock')
    case 'blockquote':
      return editor.isActive('blockquote')
    case 'divider':
      return editor.isActive('horizontalRule')
    case 'taskList':
      return editor.isActive('taskList')
  }
}

function turnIntoParagraph(props: BlockCommandContext) {
  if (isTurnIntoBlockActive(props.editor, 'paragraph')) {
    return true
  }

  return props.commands.clearNodes()
}

function turnIntoHeading(props: BlockCommandContext, level: 1 | 2 | 3 | 4 | 5) {
  if (props.editor.isActive('heading', { level })) {
    return true
  }

  ensureParagraphBase(props)
  return props.commands.setNode('heading', { level })
}

function turnIntoBulletList(props: BlockCommandContext) {
  if (props.editor.isActive('bulletList')) {
    return true
  }

  ensureParagraphBase(props)
  return props.commands.toggleBulletList()
}

function turnIntoOrderedList(props: BlockCommandContext) {
  if (props.editor.isActive('orderedList')) {
    return true
  }

  ensureParagraphBase(props)
  return props.commands.toggleOrderedList()
}

function turnIntoCodeBlock(props: BlockCommandContext) {
  if (props.editor.isActive('codeBlock')) {
    return true
  }

  ensureParagraphBase(props)
  return props.commands.toggleCodeBlock()
}

function turnIntoBlockquote(props: BlockCommandContext) {
  if (props.editor.isActive('blockquote')) {
    return true
  }

  ensureParagraphBase(props)
  return props.commands.toggleBlockquote()
}

function turnIntoDivider(props: BlockCommandContext) {
  if (props.editor.isActive('horizontalRule')) {
    return true
  }

  ensureParagraphBase(props)
  return props.commands.setHorizontalRule()
}

function turnIntoTaskList(props: BlockCommandContext) {
  if (props.editor.isActive('taskList')) {
    return true
  }

  ensureParagraphBase(props)
  return props.commands.toggleTaskList()
}

function ensureParagraphBase(props: BlockCommandContext) {
  if (isPlainParagraphActive(props.editor)) {
    return true
  }

  return props.commands.clearNodes()
}

function isPlainParagraphActive(editor: Editor) {
  return editor.isActive('paragraph')
    && !editor.isActive('heading')
    && !editor.isActive('bulletList')
    && !editor.isActive('orderedList')
    && !editor.isActive('taskList')
    && !editor.isActive('codeBlock')
    && !editor.isActive('blockquote')
}

function getActiveListItemType(editor: Editor) {
  if (editor.isActive('taskItem')) {
    return 'taskItem'
  }

  if (editor.isActive('listItem')) {
    return 'listItem'
  }

  return null
}

function canIndentCurrentListItem(editor: Editor, listItemType: 'listItem' | 'taskItem') {
  const currentBlock = getCurrentBlock(editor.state.selection)

  if (!currentBlock || currentBlock.node.type.name !== listItemType) {
    return false
  }

  return currentBlock.index > 0
}

function splitCurrentBlock(props: BlockCommandContext) {
  if (!canHandlePlainBlockBoundary(props.editor)) {
    return false
  }

  const handled = props.commands.first(({ commands }) => [
    () => commands.newlineInCode(),
    () => commands.createParagraphNear(),
    () => commands.liftEmptyBlock(),
    () => commands.splitBlock({ keepMarks: false }),
  ])

  if (!handled || !props.editor.state.selection.empty) {
    return handled
  }

  const transaction = props.editor.state.tr.setStoredMarks(EMPTY_STORED_MARKS)

  if (transaction.storedMarksSet) {
    props.editor.view.dispatch(transaction)
  }

  return true
}

function mergeBlockBackward(props: BlockCommandContext) {
  if (!canMergeCurrentBlock(props.editor)) {
    return false
  }

  return props.commands.first(({ commands }) => [
    () => commands.undoInputRule(),
    () => commands.joinBackward(),
    () => commands.selectNodeBackward(),
  ])
}

function duplicateCurrentBlock(props: CommandProps) {
  const currentBlock = getCurrentBlock(props.tr.selection)

  if (!currentBlock) {
    return false
  }

  props.tr.insert(currentBlock.to, currentBlock.node.copy(currentBlock.node.content))
  return true
}

function moveCurrentBlock(props: CommandProps, direction: 'up' | 'down') {
  const currentBlock = getCurrentBlock(props.tr.selection)

  if (!currentBlock) {
    return false
  }

  const targetPosition = getMoveTargetPosition(currentBlock, direction)

  if (targetPosition === null) {
    return false
  }

  props.tr.delete(currentBlock.from, currentBlock.to)
  props.tr.insert(targetPosition, currentBlock.node)
  setSelectionNearMovedBlock(props, targetPosition)

  return true
}

function moveCurrentBlockTo(
  props: CommandProps,
  targetBlockId: string,
  placement: 'before' | 'after',
) {
  const currentBlock = getCurrentBlock(props.tr.selection)

  if (!currentBlock) {
    return false
  }

  const targetBlock = findBlockById(props.tr.doc, targetBlockId)

  if (!targetBlock || targetBlock.parent !== currentBlock.parent || targetBlock.from === currentBlock.from) {
    return false
  }

  const deletedSize = currentBlock.to - currentBlock.from
  let insertPosition = placement === 'before'
    ? targetBlock.from
    : targetBlock.to

  if (currentBlock.from < insertPosition) {
    insertPosition -= deletedSize
  }

  if (insertPosition === currentBlock.from) {
    return false
  }

  props.tr.delete(currentBlock.from, currentBlock.to)
  props.tr.insert(insertPosition, currentBlock.node)
  setSelectionNearMovedBlock(props, insertPosition)

  return true
}

function insertBlockAfterCurrent(props: CommandProps) {
  const currentBlock = getCurrentBlock(props.tr.selection)

  if (!currentBlock) {
    return false
  }

  const insertedBlock = createInsertedBlock(props.editor, currentBlock.node.type.name)

  if (!insertedBlock) {
    return false
  }

  props.tr.insert(currentBlock.to, insertedBlock)
  setSelectionNearMovedBlock(props, currentBlock.to)

  return true
}

function deleteCurrentBlock(props: CommandProps) {
  const currentBlock = getCurrentBlock(props.tr.selection)

  if (!currentBlock) {
    return false
  }

  props.tr.delete(currentBlock.from, currentBlock.to)
  return true
}

function createInsertedBlock(editor: Editor, currentBlockType: string) {
  if (currentBlockType === 'listItem' || currentBlockType === 'taskItem') {
    return editor.schema.nodes[currentBlockType]?.createAndFill()
  }

  return editor.schema.nodes.paragraph?.createAndFill()
}

function getMoveTargetPosition(
  currentBlock: CurrentBlockSelection,
  direction: 'up' | 'down',
) {
  if (direction === 'up') {
    if (currentBlock.index <= 0) {
      return null
    }

    return currentBlock.from - currentBlock.parent.child(currentBlock.index - 1).nodeSize
  }

  if (currentBlock.index >= currentBlock.parent.childCount - 1) {
    return null
  }

  return currentBlock.from + currentBlock.parent.child(currentBlock.index + 1).nodeSize
}

function setSelectionNearMovedBlock(props: CommandProps, blockStartPosition: number) {
  const selection = Selection.findFrom(
    props.tr.doc.resolve(blockStartPosition + 1),
    1,
    true,
  )

  if (!selection) {
    return
  }

  props.tr.setSelection(selection)
}

function canHandlePlainBlockBoundary(editor: Editor) {
  if (!editor.state.selection.empty) {
    return false
  }

  return !hasSplitMergeExcludedAncestor(editor)
}

function canMergeCurrentBlock(editor: Editor) {
  if (!canHandlePlainBlockBoundary(editor)) {
    return false
  }

  return editor.state.selection.$from.parentOffset === 0
}

function hasSplitMergeExcludedAncestor(editor: Editor) {
  const { $from } = editor.state.selection

  return Array.from({ length: $from.depth + 1 }, (_, depth) => $from.node(depth).type.name)
    .some(nodeName => SPLIT_MERGE_EXCLUDED_NODE_NAMES.has(nodeName))
}
