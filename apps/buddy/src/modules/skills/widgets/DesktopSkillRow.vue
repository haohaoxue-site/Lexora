<script setup lang="ts">
import type { LocalSkill } from '@buddy-shared/skills/skillApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { isSkillAvailable } from '@buddy-shared/skills/skillApi'
import { ErrorCircle16Regular } from '@vicons/fluent'
import { NSwitch, NTag, NTooltip } from 'naive-ui'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import SkillIcon from '@/shared/ui/icon/SkillIcon.vue'

const props = defineProps<{
  skill: LocalSkill
  overriddenBy?: LocalSkill
  language: BuddyLocale
  inSpace: boolean
  busy: boolean
}>()
defineEmits<{ inspect: [skill: LocalSkill], locate: [skill: LocalSkill], enable: [skill: LocalSkill, value: boolean] }>()
const { t } = useBuddyI18n(() => props.language)
const overrideHint = computed(() => props.overriddenBy ? t(`desktop.skills.overrideHint.${props.overriddenBy.source}`) : '')
const toggleDisabled = computed(() => props.busy || (props.inSpace && !props.skill.spaceId))
</script>

<template>
  <article class="skill-row" :class="{ 'is-shadowed': skill.status === 'shadowed' }" :data-skill-id="skill.id" :data-skill-name="skill.name" :data-skill-source="skill.source">
    <div class="skill-row__content">
      <button class="skill-row__main" type="button" @click="$emit('inspect', skill)">
        <span class="skill-row__icon"><DesktopIcon :component="SkillIcon" :size="22" /></span>
        <span class="skill-row__copy">
          <span class="skill-row__heading">
            <span class="skill-row__name">{{ skill.name }}</span>
            <NTag v-if="skill.managedBy === 'application'" class="skill-row__builtin" size="small" :bordered="false">
              {{ t('desktop.skills.application') }}
            </NTag>
          </span>
          <span class="skill-row__description">{{ skill.description }}</span>
        </span>
      </button>
    </div>
    <div class="skill-row__actions">
      <NTag v-if="skill.status === 'manual_only' || skill.status === 'invalid'" size="small" :bordered="false" :type="skill.status === 'invalid' ? 'warning' : 'default'">
        {{ t(`desktop.skills.status.${skill.status}`) }}
      </NTag>
      <NSwitch v-if="skill.managedBy !== 'directory'" :round="false" size="small" :value="skill.enabled" :disabled="toggleDisabled" :aria-disabled="toggleDisabled" :aria-label="t('desktop.skills.toggle', { name: skill.name })" @update:value="$emit('enable', skill, $event)" />
      <NTooltip v-if="overriddenBy">
        <template #trigger>
          <button class="skill-row__override" type="button" :aria-label="overrideHint" @click="$emit('locate', overriddenBy)">
            <DesktopIcon :component="ErrorCircle16Regular" :size="18" />
          </button>
        </template>
        {{ overrideHint }}
        <template v-if="!isSkillAvailable(overriddenBy)">
          <br>{{ t('desktop.skills.overrideUnavailable') }}
        </template>
      </NTooltip>
    </div>
  </article>
</template>

<style scoped>
.skill-row { display: flex; align-items: center; gap: 1rem; padding: 0.9rem 0; border-bottom: 1px solid var(--buddy-border-subtle); scroll-margin: 1rem; }
.skill-row__content { flex: 1; min-width: 0; }
.skill-row__main { display: flex; width: 100%; min-width: 0; align-items: flex-start; gap: 0.8rem; padding: 0.3rem; border: 0; border-radius: 0.4rem; background: transparent; color: var(--buddy-text-primary); font: inherit; text-align: left; cursor: pointer; }
.skill-row__main:hover { background: var(--buddy-state-hover); }
.skill-row__main:focus-visible, .skill-row__override:focus-visible { outline: 2px solid var(--buddy-focus-ring); outline-offset: 2px; }
.skill-row__icon { display: grid; flex: none; width: 2.25rem; height: 2.25rem; place-items: center; border: 1px solid var(--buddy-accent-border); border-radius: 0.55rem; background: var(--buddy-accent-surface-subtle); color: var(--buddy-accent-text); box-shadow: inset 0 1px 0 var(--buddy-surface-raised); }
.skill-row__copy { display: grid; min-width: 0; gap: 0.3rem; }
.skill-row__heading { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 0.55rem; }
.skill-row__name { font-size: 0.86rem; font-weight: 650; overflow-wrap: anywhere; }
.skill-row__builtin { flex: none; color: var(--buddy-text-secondary); }
.skill-row__description { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: var(--buddy-text-secondary); font-size: 0.78rem; line-height: 1.6; }
.is-shadowed .skill-row__name, .is-shadowed .skill-row__description { color: var(--buddy-text-muted); }
.skill-row__actions { display: flex; align-items: center; flex: none; gap: 0.7rem; }
.skill-row__override { display: grid; width: 1.5rem; height: 1.5rem; place-items: center; padding: 0; border: 0; border-radius: 3px; background: transparent; color: var(--buddy-text-muted); cursor: pointer; }
.skill-row__override:hover { color: var(--buddy-accent-text); }
@media (max-width: 900px) {
  .skill-row { align-items: flex-start; flex-wrap: wrap; gap: 0.6rem; }
  .skill-row__content { flex-basis: 100%; }
  .skill-row__actions:empty { display: none; }
  .skill-row__actions { margin-left: 3.35rem; }
}
</style>
