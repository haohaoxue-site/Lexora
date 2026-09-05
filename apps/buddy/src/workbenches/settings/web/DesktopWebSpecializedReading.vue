<script setup lang="ts">
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{ language: BuddyLocale }>()
const { t } = useBuddyI18n(() => props.language)
const sites = [{ name: 'GitHub', description: 'desktop.web.githubReading' }] as const
</script>

<template>
  <section class="desktop-web-specialized">
    <header class="desktop-web-specialized__header">
      <h3 class="desktop-web-specialized__title">
        {{ t('desktop.web.specialized') }}
      </h3>
      <p>{{ t('desktop.web.specializedDescription') }}</p>
    </header>
    <ul class="desktop-web-specialized__list">
      <li v-for="site in sites" :key="site.name" class="desktop-web-specialized__site">
        <strong>{{ site.name }}</strong>
        <span>{{ t(site.description) }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped lang="scss">
.desktop-web-specialized { display: grid; gap: 0.65rem; }
.desktop-web-specialized__header { display: grid; gap: 0.3rem; }
.desktop-web-specialized__title { margin: 0; font-size: 0.82rem; font-weight: 600; }
.desktop-web-specialized p, .desktop-web-specialized__site span { margin: 0; color: var(--buddy-text-secondary); font-size: 0.75rem; line-height: 1.65; }
.desktop-web-specialized__list { margin: 0; padding: 0; list-style: none; border: 1px solid var(--buddy-border-subtle); border-radius: 0.65rem; }
.desktop-web-specialized__site { display: flex; align-items: baseline; flex-wrap: wrap; gap: 0.3rem 1.25rem; padding: 0.85rem 1rem; }
.desktop-web-specialized__site strong { font-size: 0.8rem; font-weight: 500; }
</style>
