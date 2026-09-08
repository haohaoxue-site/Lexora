export type ChatBlockerKind = 'runtime' | 'provider' | 'model'

export interface ChatBlocker {
  dismissible: boolean
  kind: ChatBlockerKind
}
