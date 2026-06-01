import type {
  OwnedDocumentCollectionId,
} from '@haohaoxue/samepage-contracts'

export interface MoveTreeNode {
  id: string
  title: string
  hasChildren: boolean
  hasContent: boolean
  disabled: boolean
  children: MoveTreeNode[]
}

export interface SelectedMoveTarget {
  workspaceId: string
  collectionId: OwnedDocumentCollectionId
  parentId: string | null
  label: string
}
