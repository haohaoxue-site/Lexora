import type { LocalFileChangeDetail } from '@buddy-electron/shared/localChatApi'
import type { TreeOption } from 'naive-ui'
import type { MaterialFileIconName } from '@/assets/file-icons/materialFileIcons'
import { diffLines } from 'diff'
import { materialFileIconNameFromPath } from '@/assets/file-icons/materialFileIcons'

export type FileChangeType = LocalFileChangeDetail['changeType']

export interface LineChangeCounts {
  added: number
  deleted: number
}

export interface ChangeFileTreeNode extends TreeOption {
  changeType?: FileChangeType
  fileId?: string
  fileIcon?: MaterialFileIconName
  kind: 'directory' | 'file'
  lineCounts?: LineChangeCounts
}

interface DirectoryNode {
  directories: Map<string, DirectoryNode>
  files: LocalFileChangeDetail[]
  name: string
  path: string
}

export function countChangedLines(before: string, after: string): LineChangeCounts {
  let added = 0
  let deleted = 0
  for (const change of diffLines(before, after)) {
    if (change.added)
      added += change.count ?? 0
    else if (change.removed)
      deleted += change.count ?? 0
  }
  return { added, deleted }
}

export function fileNameFromPath(path: string): string {
  return path.split('/').at(-1) ?? path
}

export const fileIconNameFromPath = materialFileIconNameFromPath

export function buildChangeFileTree(
  files: ReadonlyArray<LocalFileChangeDetail>,
): TreeOption[] {
  const root: DirectoryNode = {
    directories: new Map(),
    files: [],
    name: '',
    path: '',
  }
  for (const file of files) {
    const segments = file.path.split('/').filter(Boolean)
    const fileName = segments.pop()
    if (!fileName)
      continue
    let directory = root
    for (const segment of segments) {
      const directoryPath = directory.path ? `${directory.path}/${segment}` : segment
      const child = directory.directories.get(segment) ?? {
        directories: new Map(),
        files: [],
        name: segment,
        path: directoryPath,
      }
      directory.directories.set(segment, child)
      directory = child
    }
    directory.files.push(file)
  }
  return projectDirectoryChildren(root)
}

function projectDirectoryChildren(directory: DirectoryNode): ChangeFileTreeNode[] {
  const directories = [...directory.directories.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(child => ({
      children: projectDirectoryChildren(child),
      key: `directory:${child.path}`,
      kind: 'directory' as const,
      label: child.name,
    }))
  const files = [...directory.files]
    .sort((left, right) => fileNameFromPath(left.path).localeCompare(fileNameFromPath(right.path)))
    .map(file => ({
      changeType: file.changeType,
      fileId: file.id,
      fileIcon: fileIconNameFromPath(file.path),
      isLeaf: true,
      key: file.id,
      kind: 'file' as const,
      label: fileNameFromPath(file.path),
      lineCounts: file.preview === 'text'
        ? countChangedLines(file.beforeText ?? '', file.afterText ?? '')
        : undefined,
    }))
  return [...directories, ...files]
}
