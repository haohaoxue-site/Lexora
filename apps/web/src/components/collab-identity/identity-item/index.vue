<script setup lang="ts">
import type { CollabIdentityItemProps } from './typing'
import { formatCollabIdentityLabel } from '@haohaoxue/samepage-shared'
import { computed } from 'vue'
import EntityAvatar from '@/components/entity-avatar'

const props = withDefaults(defineProps<CollabIdentityItemProps>(), {
  avatarSize: 40,
})

const identityLabel = computed(() => formatCollabIdentityLabel(props.identity))
</script>

<template>
  <div class="collab-identity-item flex min-w-0 items-center gap-3">
    <EntityAvatar
      :name="props.identity.displayName"
      :src="props.identity.avatarUrl"
      :alt="`${props.identity.displayName} 的头像`"
      :size="props.avatarSize"
      shape="circle"
      kind="user"
      class="collab-identity-item__avatar"
    />

    <span class="collab-identity-item__label min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold" :title="identityLabel">
      {{ identityLabel }}
    </span>
  </div>
</template>

<style scoped lang="scss">
.collab-identity-item {
  &__avatar {
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand-border-base) 70%, transparent);
  }

  &__label {
    color: var(--brand-text-primary);
  }
}
</style>
