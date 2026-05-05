import type { DocumentSectionPanelProps } from '../typing'
import { formatDocumentCollectionLabel } from '@haohaoxue/samepage-shared'
import { computed } from 'vue'

export function useDocumentSectionPanel(
  props: DocumentSectionPanelProps,
  onToggleCollapse: (collectionId: DocumentSectionPanelProps['group']['id']) => void,
) {
  const displayLabel = computed(() => formatDocumentCollectionLabel(props.group.id))
  const chevronIconName = computed(() => props.isCollapsed ? 'chevron-right' : 'chevron-down')

  function toggleSection() {
    onToggleCollapse(props.group.id)
  }

  return {
    chevronIconName,
    displayLabel,
    toggleSection,
  }
}
