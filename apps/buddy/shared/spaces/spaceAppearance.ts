import { z } from 'zod'

export const SPACE_LINEAR_ICONS = [
  'folder',
  'code',
  'book',
  'pen',
  'terminal',
  'briefcase',
  'home',
  'globe',
  'lightbulb',
  'rocket',
  'beaker',
  'music',
  'image',
  'heart',
  'star',
  'calendar',
  'shield',
  'cube',
] as const

export const SPACE_FILLED_ICONS = SPACE_LINEAR_ICONS.map(icon => `${icon}-filled` as const)
export const SPACE_ICONS = [...SPACE_LINEAR_ICONS, ...SPACE_FILLED_ICONS] as const
export type SpaceLinearIcon = typeof SPACE_LINEAR_ICONS[number]

export const SPACE_ICON_COLORS = [
  'default',
  'gray',
  'gray-deep',
  'red',
  'red-bright',
  'red-deep',
  'orange',
  'orange-bright',
  'orange-deep',
  'yellow',
  'yellow-bright',
  'yellow-deep',
  'green',
  'green-bright',
  'green-deep',
  'cyan',
  'cyan-bright',
  'cyan-deep',
  'blue',
  'blue-bright',
  'blue-deep',
  'purple',
  'purple-bright',
  'purple-deep',
  'pink',
  'pink-bright',
  'pink-deep',
] as const

export const spaceIconSchema = z.enum(SPACE_ICONS)
export const spaceIconColorSchema = z.enum(SPACE_ICON_COLORS)

export type SpaceIcon = z.infer<typeof spaceIconSchema>
export type SpaceIconColor = z.infer<typeof spaceIconColorSchema>
