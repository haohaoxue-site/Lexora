import type { VNodeChild } from 'vue'

export interface DocsSidebarFooterAction {
  id: string
  label: string
  isActive: boolean
  icon: () => VNodeChild
  onClick: () => void
}
