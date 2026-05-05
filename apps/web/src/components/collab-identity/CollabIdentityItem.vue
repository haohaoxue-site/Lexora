<script setup lang="ts">
import type { CollabIdentityItemProps } from './typing'
import { formatCollabIdentityLabel } from '@haohaoxue/samepage-shared'
import { computed } from 'vue'
import EntityAvatar from '@/components/entity-avatar/EntityAvatar.vue'

const props = withDefaults(defineProps<CollabIdentityItemProps>(), {
  avatarSize: 40,
})

const identityLabel = computed(() => formatCollabIdentityLabel(props.identity))
</script>

<template>
  <div class="collab-identity-item">
    <EntityAvatar
      :name="props.identity.displayName"
      :src="props.identity.avatarUrl"
      :alt="`${props.identity.displayName} 的头像`"
      :size="props.avatarSize"
      shape="circle"
      kind="user"
      class="collab-identity-item__avatar"
    />

    <span class="collab-identity-item__label" :title="identityLabel">
      {{ identityLabel }}
    </span>
  </div>
</template>

<style scoped lang="scss">
.collab-identity-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;

  &__avatar {
    flex-shrink: 0;
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand-border-base) 70%, transparent);
  }

  &__label {
    min-width: 0;
    overflow: hidden;
    color: var(--brand-text-primary);
    font-size: 0.875rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
