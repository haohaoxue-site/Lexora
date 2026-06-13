<script setup lang="ts">
import type {
  CollaborationAvatarStackEmits,
  CollaborationAvatarStackProps,
} from './typing'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  formatCollaborationIdentity,
  getCollaborationAvatarText,
  getCollaborationIdentityName,
} from '../../utils/documentCollaboration'

const props = withDefaults(defineProps<CollaborationAvatarStackProps>(), {
  canOpen: false,
})
const emits = defineEmits<CollaborationAvatarStackEmits>()
const { t } = useI18n()

const visibleCollaborators = computed(() => props.collaborators.slice(0, 2))
const remainingCollaboratorCount = computed(() => Math.max(props.collaborators.length - visibleCollaborators.value.length, 0))

function openCollaborators() {
  if (!props.canOpen) {
    return
  }

  emits('open')
}
</script>

<template>
  <button
    v-if="props.owner || props.collaborators.length"
    type="button"
    class="collaboration-avatar-stack inline-flex flex-[0_0_auto] items-center gap-0 rounded-full border-0 px-2 py-[0.25rem]"
    :class="{ 'is-clickable': props.canOpen }"
    :aria-label="t('docs.common.currentCollaborators')"
    :aria-disabled="!props.canOpen"
    @click="openCollaborators"
  >
    <ElTooltip
      v-if="props.owner"
      :content="`${getCollaborationIdentityName(props.owner)} · ${t('docs.treeMenu.owner')}`"
      placement="top"
    >
      <ElAvatar
        :size="28"
        :src="props.owner.avatarUrl ?? undefined"
        class="collaboration-avatar-stack__avatar"
      >
        {{ getCollaborationAvatarText(props.owner) }}
      </ElAvatar>
    </ElTooltip>

    <span
      v-if="props.owner && props.collaborators.length > 0"
      class="collaboration-avatar-stack__separator mx-[0.38rem] ml-[0.42rem] h-[1.25rem] w-px"
      aria-hidden="true"
    />

    <ElTooltip
      v-for="(collaborator, collaboratorIndex) in visibleCollaborators"
      :key="collaborator.userId"
      :content="formatCollaborationIdentity(collaborator.user)"
      placement="top"
    >
      <ElAvatar
        :size="28"
        :src="collaborator.user.avatarUrl ?? undefined"
        class="collaboration-avatar-stack__avatar"
        :class="{ '-ml-2': collaboratorIndex > 0 }"
      >
        {{ getCollaborationAvatarText(collaborator.user) }}
      </ElAvatar>
    </ElTooltip>

    <ElAvatar
      v-if="remainingCollaboratorCount > 0"
      :size="28"
      class="collaboration-avatar-stack__avatar collaboration-avatar-stack__avatar--more"
      :class="{ '-ml-2': visibleCollaborators.length > 0 }"
    >
      +{{ remainingCollaboratorCount }}
    </ElAvatar>

    <SvgIcon
      category="ui"
      icon="chevron-right"
      size="0.9rem"
      class="collaboration-avatar-stack__arrow ml-[0.28rem]"
    />
  </button>
</template>

<style scoped lang="scss">
.collaboration-avatar-stack {
  background: color-mix(in srgb, var(--brand-fill-lighter) 78%, transparent);
  cursor: default;

  &.is-clickable {
    cursor: pointer;
  }

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--brand-primary) 68%, transparent);
    outline-offset: 4px;
  }
}

.collaboration-avatar-stack__avatar {
  border: 2px solid var(--brand-bg-surface);
  box-shadow: 0 0.25rem 0.75rem color-mix(in srgb, #000000 8%, transparent);
}

.collaboration-avatar-stack__separator {
  background: color-mix(in srgb, var(--brand-border-base) 72%, transparent);
}

.collaboration-avatar-stack__avatar--more {
  color: var(--brand-text-secondary);
  background: color-mix(in srgb, var(--brand-border-base) 30%, var(--brand-bg-surface));
}

.collaboration-avatar-stack__arrow {
  color: var(--brand-text-secondary);
}
</style>
