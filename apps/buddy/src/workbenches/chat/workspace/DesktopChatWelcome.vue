<script setup lang="ts">
import type { DesktopChatWelcomeVariant } from './desktopChatWelcomeVariants'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopChatWelcomeDecoration from './DesktopChatWelcomeDecoration.vue'

const props = defineProps<{
  language: BuddyLocale
  variant: DesktopChatWelcomeVariant
}>()

const { t } = useBuddyI18n(() => props.language)
</script>

<template>
  <section class="desktop-chat-welcome" :data-variant="variant.id">
    <img
      class="desktop-chat-welcome__illustration"
      :src="variant.illustrationUrl"
      alt=""
      draggable="false"
    >
    <div
      class="desktop-chat-welcome__heading"
      :data-decoration="variant.decoration"
    >
      <h1>{{ t(variant.titleKey) }}</h1>
      <DesktopChatWelcomeDecoration :type="variant.decoration" />
    </div>
  </section>
</template>

<style scoped lang="scss">
.desktop-chat-welcome {
  --desktop-chat-welcome-illustration-offset-x: 0%;
  --desktop-chat-welcome-illustration-offset-bottom: 0rem;

  display: grid;
  width: min(calc(100% - 2.5rem), 44rem);
  justify-items: center;
  gap: 0.55rem;
  margin: 0 auto;
  text-align: center;
}

.desktop-chat-welcome[data-variant='listening'] {
  --desktop-chat-welcome-illustration-offset-x: -4.8%;
  --desktop-chat-welcome-illustration-offset-bottom: -1.3rem;
}

.desktop-chat-welcome[data-variant='orchestrating'] {
  --desktop-chat-welcome-illustration-offset-x: -3.7%;
  --desktop-chat-welcome-illustration-offset-bottom: -1.4rem;
}

.desktop-chat-welcome[data-variant='planning'] {
  --desktop-chat-welcome-illustration-offset-x: 1%;
  --desktop-chat-welcome-illustration-offset-bottom: -2.2rem;
}

.desktop-chat-welcome[data-variant='writing'] {
  --desktop-chat-welcome-illustration-offset-x: -2.3%;
  --desktop-chat-welcome-illustration-offset-bottom: -1rem;
}

.desktop-chat-welcome__illustration {
  width: clamp(14rem, 31vh, 19rem);
  height: clamp(14rem, 31vh, 19rem);
  margin-bottom: var(--desktop-chat-welcome-illustration-offset-bottom);
  object-fit: contain;
  transform: translateX(var(--desktop-chat-welcome-illustration-offset-x));
  user-select: none;
}

.desktop-chat-welcome__heading {
  position: relative;
  display: inline-grid;
  max-width: calc(100% - 2.5rem);
  justify-items: center;

  h1 {
    margin: 0;
    color: var(--buddy-text-primary);
    font-family: "Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", STSong, SimSun, serif;
    font-size: clamp(1.75rem, 2.5vw, 2.15rem);
    font-weight: 600;
    letter-spacing: 0.01em;
    line-height: 1.3;
    text-rendering: optimizelegibility;
  }
}

@media (max-height: 720px) {
  .desktop-chat-welcome {
    gap: 0.35rem;
  }

  .desktop-chat-welcome[data-variant='listening'],
  .desktop-chat-welcome[data-variant='orchestrating'] {
    --desktop-chat-welcome-illustration-offset-bottom: -1rem;
  }

  .desktop-chat-welcome[data-variant='planning'] {
    --desktop-chat-welcome-illustration-offset-bottom: -1.6rem;
  }

  .desktop-chat-welcome[data-variant='writing'] {
    --desktop-chat-welcome-illustration-offset-bottom: -0.75rem;
  }

  .desktop-chat-welcome__illustration {
    width: 13rem;
    height: 13rem;
  }

  .desktop-chat-welcome__heading h1 {
    font-size: 1.6rem;
  }
}
</style>
