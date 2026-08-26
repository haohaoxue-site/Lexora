<script setup lang="ts">
import type { DesktopLocalSettingsCapability } from '@/workbenches/settings/local/desktopLocalSettingsCapability'
import { NAlert, NEmpty, NSpin, NTag } from 'naive-ui'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{ localSettings: DesktopLocalSettingsCapability }>()
const localSettings = props.localSettings
const { t } = useBuddyI18n(localSettings.language)
</script>

<template>
  <section class="desktop-skills-settings">
    <header><h2>{{ t('desktop.skills.title') }}</h2><p>{{ t('desktop.skills.description') }}</p></header>
    <NAlert v-if="localSettings.skillsError.value" type="error" :show-icon="false">
      {{ localSettings.skillsError.value }}
    </NAlert>
    <NSpin v-if="localSettings.isLoadingSkills.value && !localSettings.skills.value.skills.length" />
    <NEmpty v-else-if="!localSettings.skills.value.skills.length" :description="t('desktop.skills.empty')" />
    <div v-else class="desktop-skills-settings__group">
      <article v-for="skill in localSettings.skills.value.skills" :key="`${skill.source}:${skill.name}`">
        <div><strong>{{ skill.name }}</strong><p>{{ skill.description }}</p></div>
        <NTag :bordered="false">
          {{ t(`skill.source.${skill.source}`) }}
        </NTag>
      </article>
    </div>
    <NAlert v-for="diagnostic in localSettings.skills.value.diagnostics" :key="`${diagnostic.code}:${diagnostic.message}`" type="warning" :show-icon="false">
      {{ diagnostic.message }}
    </NAlert>
  </section>
</template>

<style scoped>
.desktop-skills-settings { display: grid; gap: 0.8rem; }
.desktop-skills-settings h2,
.desktop-skills-settings p { margin: 0; }
.desktop-skills-settings header p,
.desktop-skills-settings article p { margin-top: 0.25rem; color: var(--buddy-text-secondary); font-size: 0.75rem; }
.desktop-skills-settings__group { overflow: hidden; border: 1px solid var(--buddy-border-subtle); border-radius: 0.65rem; background: var(--buddy-surface-base); }
.desktop-skills-settings article { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; border-bottom: 1px solid var(--buddy-border-subtle); padding: 0.85rem 0.9rem; }
.desktop-skills-settings article:last-child { border-bottom: 0; }
</style>
