import type { LocalArtifact, LocalRunOutput } from '@buddy-electron/shared/localChatApi'

export interface TaskArtifactContextTab {
  artifact: LocalArtifact
  id: string
  kind: 'artifact'
  label: string
}

export type TaskContextTab = TaskArtifactContextTab

export function projectTaskArtifactTabs(
  outputs: ReadonlyArray<LocalRunOutput>,
): ReadonlyArray<TaskArtifactContextTab> {
  const artifacts = new Map<string, LocalArtifact>()
  for (const output of outputs) {
    for (const artifact of output.artifacts)
      artifacts.set(artifact.artifactId, artifact)
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
