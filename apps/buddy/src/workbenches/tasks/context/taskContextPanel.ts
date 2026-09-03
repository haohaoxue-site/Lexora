import type {
  LocalArtifact,
  LocalChangeSetSummary,
  LocalRunOutput,
} from '@buddy-electron/shared/localChatApi'

export interface TaskArtifactContextTab {
  artifact: LocalArtifact
  id: string
  kind: 'artifact'
  label: string
}

export interface TaskChangesContextTab {
  changeSet: LocalChangeSetSummary
  id: string
  kind: 'changes'
  label: string
}

export interface TaskBrowserContextTab {
  conversationId: string
  id: string
  kind: 'browser'
}

export type TaskContextTab = TaskArtifactContextTab
  | TaskBrowserContextTab
  | TaskChangesContextTab

export function spaceTaskArtifactTabs(
  outputs: ReadonlyArray<LocalRunOutput>,
): ReadonlyArray<TaskArtifactContextTab> {
  const artifacts = new Map<string, LocalArtifact>()
  for (const output of outputs) {
    for (const artifact of output.artifacts) {
      if (artifact.deletedAt === null)
        artifacts.set(artifact.artifactId, artifact)
      else
        artifacts.delete(artifact.artifactId)
    }
  }
  return [...artifacts.values()].map(artifact => ({
    artifact,
    id: artifactTabId(artifact.artifactId),
    kind: 'artifact',
    label: artifact.name,
  }))
}

export function artifactTabId(artifactId: string): string {
  return `artifact:${artifactId}`
}

export function isBrowserArtifact(
  artifact: Pick<LocalArtifact, 'mimeType' | 'name'>,
): boolean {
  return artifact.mimeType === 'text/html' && /\.html?$/i.test(artifact.name)
}

export function spaceTaskBrowserTab(
  conversationId: string | null,
): TaskBrowserContextTab | null {
  return conversationId
    ? {
        conversationId,
        id: browserTabId(conversationId),
        kind: 'browser',
      }
    : null
}

export function browserTabId(conversationId: string): string {
  return `browser:${conversationId}`
}

export function spaceTaskChangeTabs(
  changeSets: ReadonlyArray<LocalChangeSetSummary>,
): ReadonlyArray<TaskChangesContextTab> {
  return changeSets.map(changeSet => ({
    changeSet,
    id: changeTabId(changeSet.changeSetId),
    kind: 'changes',
    label: `Changes (${changeSet.fileCount})`,
  }))
}

export function changeTabId(changeSetId: string): string {
  return `changes:${changeSetId}`
}
