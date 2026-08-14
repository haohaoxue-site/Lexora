<script setup lang="ts">
import type { DesktopChatController } from './useDesktopChat'
import { NAlert, NEmpty, NSpin, NTag } from 'naive-ui'
import { onMounted } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{ chat: DesktopChatController }>()
const chat = props.chat
const { t } = useBuddyI18n(chat.language)
onMounted(() => void chat.loadSkills(chat.projectId.value))
</script>

<template>
  <section class="desktop-skills-settings">
    <header><h2>{{ t('desktop.skills.title') }}</h2><p>{{ t('desktop.skills.description') }}</p></header>
    <NAlert v-if="chat.skillsError.value" type="error" :show-icon="false">
      {{ chat.skillsError.value }}
    </NAlert>
    <NSpin v-if="chat.isLoadingSkills.value && !chat.skills.value.skills.length" />
    <NEmpty v-else-if="!chat.skills.value.skills.length" :description="t('desktop.skills.empty')" />
    <div v-else class="desktop-skills-settings__group">
      <article v-for="skill in chat.skills.value.skills" :key="`${skill.source}:${skill.name}`">
        <div><strong>{{ skill.name }}</strong><p>{{ skill.description }}</p></div>
        <NTag :bordered="false">
          {{ t(`skill.source.${skill.source}`) }}
        </NTag>
      </article>
    </div>
    <NAlert v-for="diagnostic in chat.skills.value.diagnostics" :key="`${diagnostic.code}:${diagnostic.message}`" type="warning" :show-icon="false">
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
.desktop-skills-settings__group { overflow: hidden; border: 1px solid var(--buddy-border-light); border-radius: 0.65rem; background: var(--buddy-bg-surface); }
.desktop-skills-settings article { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; border-bottom: 1px solid var(--buddy-border-light); padding: 0.85rem 0.9rem; }
.desktop-skills-settings article:last-child { border-bottom: 0; }
</style>
