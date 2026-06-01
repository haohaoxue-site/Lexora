import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export function useCollaborationResolverNavigation() {
  const route = useRoute()
  const router = useRouter()
  const code = computed(() => typeof route.params.code === 'string' ? route.params.code : '')

  async function openDocument(documentId: string) {
    await router.replace({
      name: 'docs',
      params: { id: documentId },
    })
  }

  return {
    code,
    openDocument,
  }
}
