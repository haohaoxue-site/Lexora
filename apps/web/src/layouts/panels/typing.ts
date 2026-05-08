import type { RouteLocationRaw } from 'vue-router'
import type { SvgIconCategory, SvgIconCategoryValue } from '@/components/svg-icon/typing'

export interface SidebarPanelBrand {
  label: string
  meta?: string
  to: RouteLocationRaw
  iconCategory: SvgIconCategory | SvgIconCategoryValue
  icon: string
}

export interface SidebarPanelItem {
  name: PropertyKey
  label: string
  to: RouteLocationRaw
  iconCategory: SvgIconCategory | SvgIconCategoryValue
  icon: string
  activeIcon?: string
}
