import type { LocalArtifact } from '@buddy-shared/artifacts/artifactApi'
import type { LocalChangeSetSummary } from '@buddy-shared/changes/changeApi'
import type { LocalRunOutput } from '@buddy-shared/runs/runApi'
import type { SpaceFileTarget } from '@buddy-shared/spaces/spaceFileApi'

export interface TaskArtifactContextTab {
  artifact: LocalArtifact
  id: string
  kind: 'artifact'
  label: string
}

export interface TaskChangesContextTab {
  changeSet: LocalChangeSetSummary | null
  conversationId: string
  id: string
  kind: 'changes'
}

export interface TaskBrowserContextTab {
  conversationId: string
  id: string
  kind: 'browser'
  browserKey?: string
}

export interface TaskFilesContextTab {
  conversationId: string
  id: string
  kind: 'files'
  target: SpaceFileTarget
  rootName: string
}

export interface ContextPanelTab {
  id: string
  title: string
  icon: 'file' | 'folder' | 'changes' | 'browser'
  fileName?: string
}

export type TaskContextTab = TaskArtifactContextTab
  | TaskBrowserContextTab
  | TaskChangesContextTab
  | TaskFilesContextTab

export function spaceTaskArtifactTabs(
  outputs: ReadonlyArray<LocalRunOutput>,
): ReadonlyArray<TaskArtifactContextTab> {
  const artifacts = new Map<string, LocalArtifact>()
  for (const output of outputs) {
    for (const artifact of output.artifacts) {
      artifacts.set(artifact.artifactId, artifact)
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
  artifact: Pick<LocalArtifact, 'kind' | 'mimeType' | 'name'>,
): boolean {
  return artifact.kind === 'file'
    && artifact.mimeType === 'text/html'
    && /\.html?$/i.test(artifact.name)
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

export function changeTabId(conversationId: string): string {
  return `changes:${conversationId}`
}
