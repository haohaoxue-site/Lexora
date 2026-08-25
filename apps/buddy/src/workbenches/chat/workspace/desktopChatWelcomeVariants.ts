import type {
  DesktopChatWelcomePreference,
  DesktopChatWelcomeVariantId,
} from '@buddy-electron/shared/desktopApi'
import type { BuddyI18nKey } from '@/i18n/buddyI18n'
import listeningIllustrationUrl from '@/assets/chat-welcome/listening.webp'
import orchestratingIllustrationUrl from '@/assets/chat-welcome/orchestrating.webp'
import planningIllustrationUrl from '@/assets/chat-welcome/planning.webp'
import writingIllustrationUrl from '@/assets/chat-welcome/writing.webp'

export type DesktopChatWelcomeDecoration
  = | 'none'
    | 'orbit-arc'
    | 'trailing-star'
    | 'underline-star'

export interface DesktopChatWelcomeVariant {
  decoration: DesktopChatWelcomeDecoration
  id: DesktopChatWelcomeVariantId
  illustrationUrl: string
  titleKey: BuddyI18nKey
}

export const DESKTOP_CHAT_WELCOME_VARIANTS = [
  {
    decoration: 'underline-star',
    id: 'writing',
    illustrationUrl: writingIllustrationUrl,
    titleKey: 'desktop.chat.welcome.writing',
  },
  {
    decoration: 'none',
    id: 'planning',
    illustrationUrl: planningIllustrationUrl,
    titleKey: 'desktop.chat.welcome.planning',
  },
  {
    decoration: 'orbit-arc',
    id: 'orchestrating',
    illustrationUrl: orchestratingIllustrationUrl,
    titleKey: 'desktop.chat.welcome.orchestrating',
  },
  {
    decoration: 'trailing-star',
    id: 'listening',
    illustrationUrl: listeningIllustrationUrl,
    titleKey: 'desktop.chat.welcome.listening',
  },
] as const satisfies ReadonlyArray<DesktopChatWelcomeVariant>

export function selectDesktopChatWelcomeVariant(
  preference: DesktopChatWelcomePreference,
  randomUnit = Math.random(),
) {
  if (preference !== 'random')
    return DESKTOP_CHAT_WELCOME_VARIANTS.find(variant => variant.id === preference)!

  const boundedUnit = Number.isFinite(randomUnit)
    ? Math.min(1, Math.max(0, randomUnit))
    : 0
  const index = Math.min(
    Math.floor(boundedUnit * DESKTOP_CHAT_WELCOME_VARIANTS.length),
    DESKTOP_CHAT_WELCOME_VARIANTS.length - 1,
  )
  return DESKTOP_CHAT_WELCOME_VARIANTS[index]!
}
