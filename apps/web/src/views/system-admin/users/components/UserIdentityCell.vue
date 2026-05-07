<script setup lang="ts">
import type { SystemAdminUserItem } from '@/apis/system-admin'
import EntityAvatar from '@/components/entity-avatar/EntityAvatar.vue'

defineProps<{
  user: SystemAdminUserItem
}>()
</script>

<template>
  <div class="flex min-w-0 items-center gap-3">
    <EntityAvatar
      :name="user.displayName"
      :src="user.avatarUrl"
      :alt="`${user.displayName} 的头像`"
      :size="40"
      shape="circle"
      kind="user"
      class="shrink-0"
    />

    <span class="min-w-0 truncate text-sm font-semibold text-main" :title="user.displayName">
      {{ user.displayName }}
    </span>
  </div>
</template>
