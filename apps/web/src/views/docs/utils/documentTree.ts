import type {
  DocumentItem,
  DocumentTreeCollectionId,
  DocumentTreeGroup,
} from '@haohaoxue/samepage-contracts'

export function collectDocumentItemIds(items: DocumentItem[]): Set<string> {
  const documentIds = new Set<string>()

  for (const item of items) {
    documentIds.add(item.id)

    for (const childId of collectDocumentItemIds(item.children)) {
      documentIds.add(childId)
    }
  }

  return documentIds
}

export function updateDocumentBranch(
  items: DocumentItem[],
  targetDocumentId: string,
  input: Partial<DocumentItem>,
): DocumentItem[] {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]

    if (item.id === targetDocumentId) {
      const nextItem = applyDocumentItemPatch(item, input)

      if (nextItem === item) {
        return items
      }

      const nextItems = items.slice()
      nextItems[index] = nextItem
      return nextItems
    }

    const nextChildren = updateDocumentBranch(item.children, targetDocumentId, input)

    if (nextChildren !== item.children) {
      const nextItems = items.slice()
      nextItems[index] = {
        ...item,
        children: nextChildren,
      }
      return nextItems
    }
  }

  return items
}

export function findDocumentPath(
  groups: DocumentTreeGroup[],
  targetDocumentId: string,
): {
  collectionId: DocumentTreeCollectionId
  nodes: DocumentItem[]
} | null {
  for (const group of groups) {
    const items = findDocumentItems(group.nodes, targetDocumentId)

    if (items) {
      return {
        collectionId: group.id,
        nodes: items,
      }
    }
  }

  return null
}

export function resolveNextDocumentIdAfterDelete(
  groups: DocumentTreeGroup[],
  deletedDocumentId: string,
  currentActiveDocumentId: string | null,
): string | null {
  const targetPath = findDocumentPath(groups, deletedDocumentId)
  const targetDocument = targetPath?.nodes.at(-1)

  if (!targetDocument) {
    return currentActiveDocumentId
  }

  const deletedDocumentIds = collectDocumentItemIds([targetDocument])

  if (!currentActiveDocumentId || !deletedDocumentIds.has(currentActiveDocumentId)) {
    return currentActiveDocumentId
  }

  if (targetDocument.parentId) {
    return targetDocument.parentId
  }

  return findFirstAvailableDocumentId(
    groups.flatMap(group => group.nodes),
    deletedDocumentIds,
  )
}

export function resolvePreferredDocumentId(
  groups: DocumentTreeGroup[],
  preferredDocumentId: string | null,
): string | null {
  if (preferredDocumentId && findDocumentPath(groups, preferredDocumentId)) {
    return preferredDocumentId
  }

  return findFirstAvailableDocumentId(
    groups.flatMap(group => group.nodes),
    new Set<string>(),
  )
}

function findFirstAvailableDocumentId(
  items: DocumentItem[],
  deletedDocumentIds: Set<string>,
): string | null {
  for (const item of items) {
    if (!deletedDocumentIds.has(item.id)) {
      return item.id
    }

    const childDocumentId = findFirstAvailableDocumentId(item.children, deletedDocumentIds)

    if (childDocumentId) {
      return childDocumentId
    }
  }

  return null
}

function findDocumentItems(items: DocumentItem[], targetDocumentId: string): DocumentItem[] | null {
  for (const item of items) {
    if (item.id === targetDocumentId) {
      return [item]
    }

    const nestedItems = findDocumentItems(item.children, targetDocumentId)

    if (nestedItems) {
      return [item, ...nestedItems]
    }
  }

  return null
}

function applyDocumentItemPatch(item: DocumentItem, input: Partial<DocumentItem>): DocumentItem {
  const patchKeys = Object.keys(input) as Array<keyof DocumentItem>

  if (!patchKeys.length) {
    return item
  }

  const hasChanges = patchKeys.some(key => item[key] !== input[key])

  if (!hasChanges) {
    return item
  }

  return {
    ...item,
    ...input,
  }
}
