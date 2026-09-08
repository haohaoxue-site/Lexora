import type { LocalArtifact, LocalArtifactText } from '@buddy-shared/artifacts/artifactApi'
import { computed, readonly, shallowRef, watch } from 'vue'
import { isTextMimeType } from './artifactContextPresentation'

interface ArtifactPreviewOptions {
  artifact: () => LocalArtifact
  readText: () => (artifactId: string) => Promise<LocalArtifactText>
}

export function useArtifactPreview(options: ArtifactPreviewOptions) {
  const previewFailed = shallowRef(false)
  const previewIndex = shallowRef(0)
  const previewOpen = shallowRef(false)
  const textPreview = shallowRef<LocalArtifactText | null>(null)
  const textPreviewFailed = shallowRef(false)
  const textPreviewLoading = shallowRef(false)
  const imageUrl = computed(() => {
    const artifact = options.artifact()
    return artifact.kind === 'file' && artifact.mimeType.startsWith('image/')
      ? `lexora-artifact://preview/${encodeURIComponent(artifact.artifactId)}?v=${encodeURIComponent(artifact.updatedAt)}`
      : null
  })
  const previewUrl = computed(() => previewFailed.value ? null : imageUrl.value)
  const previewSources = computed(() => previewUrl.value ? [previewUrl.value] : [])

  watch([
    () => options.artifact().artifactId,
    () => options.artifact().updatedAt,
    () => options.artifact().kind,
    () => options.artifact().mimeType,
    options.readText,
  ], async ([artifactId, , kind, mimeType, readText], _previous, onCleanup) => {
    let active = true
    onCleanup(() => {
      active = false
    })
    previewFailed.value = false
    previewIndex.value = 0
    previewOpen.value = false
    textPreview.value = null
    textPreviewFailed.value = false
    textPreviewLoading.value = kind === 'file' && isTextMimeType(mimeType)
    if (!textPreviewLoading.value)
      return
    try {
      const result = await readText(artifactId)
      if (active)
        textPreview.value = result
    }
    catch {
      if (active)
        textPreviewFailed.value = true
    }
    finally {
      if (active)
        textPreviewLoading.value = false
    }
  }, { immediate: true, flush: 'sync' })

  function failImage(event: Event) {
    if ((event.target as HTMLImageElement | null)?.getAttribute('src') === imageUrl.value)
      previewFailed.value = true
  }

  function openPreview() {
    if (previewUrl.value)
      previewOpen.value = true
  }

  return {
    failImage,
    openPreview,
    previewIndex,
    previewOpen,
    previewSources,
    previewUrl,
    textPreview: readonly(textPreview),
    textPreviewFailed: readonly(textPreviewFailed),
    textPreviewLoading: readonly(textPreviewLoading),
  }
}
