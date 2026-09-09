import type { InlineExtension } from '@earendil-works/pi-coding-agent'

export interface BuddyInProcessExtension {
  factory: Exclude<InlineExtension, (...arguments_: never[]) => unknown>['factory']
  hidden?: boolean
  name: `lexora-${string}`
}
