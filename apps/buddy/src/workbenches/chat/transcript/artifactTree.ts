import type { LocalArtifact } from '@buddy-electron/shared/localChatApi'

export type ArtifactTreeNode = {
  children: ArtifactTreeNode[]
  kind: 'folder'
  name: string
  path: string
} | {
  artifact: LocalArtifact
  kind: 'file'
  path: string
}

export interface ArtifactTreeRow {
  depth: number
  node: ArtifactTreeNode
}

interface MutableFolder {
  files: LocalArtifact[]
  folders: Map<string, MutableFolder>
  name: string
  path: string
}

export function buildArtifactTree(
  artifacts: ReadonlyArray<LocalArtifact>,
): ArtifactTreeNode[] {
  const root: MutableFolder = {
    files: [],
    folders: new Map(),
    name: '',
    path: '',
  }
  for (const artifact of artifacts) {
    const segments = artifact.relativePath.split('/').filter(Boolean)
    const fileName = segments.pop() ?? artifact.name
    let folder = root
    for (const segment of segments) {
      const path = folder.path ? `${folder.path}/${segment}` : segment
      let child = folder.folders.get(segment)
      if (!child) {
        child = { files: [], folders: new Map(), name: segment, path }
        folder.folders.set(segment, child)
      }
      folder = child
    }
    folder.files.push({
      ...artifact,
      name: fileName,
    })
  }
  return projectFolderChildren(root)
}

export function flattenArtifactTree(nodes: readonly ArtifactTreeNode[]): ArtifactTreeRow[] {
  const rows: ArtifactTreeRow[] = []
  const visit = (children: readonly ArtifactTreeNode[], depth: number) => {
    for (const node of children) {
      rows.push({ depth, node })
      if (node.kind === 'folder')
        visit(node.children, depth + 1)
    }
  }
  visit(nodes, 0)
  return rows
}

function projectFolderChildren(folder: MutableFolder): ArtifactTreeNode[] {
  const folders: ArtifactTreeNode[] = [...folder.folders.values()]
    .sort((left, right) => compareNames(left.name, right.name))
    .map(child => ({
      children: projectFolderChildren(child),
      kind: 'folder',
      name: child.name,
      path: child.path,
    }))
  const files: ArtifactTreeNode[] = [...folder.files]
    .sort((left, right) => compareNames(left.name, right.name))
    .map(artifact => ({
      artifact,
      kind: 'file',
      path: artifact.relativePath,
    }))
  return [...folders, ...files]
}

function compareNames(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
