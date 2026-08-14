<script setup lang="ts">
import DesktopIcon from './DesktopIcon.vue'

withDefaults(defineProps<{
  size?: 'medium' | 'small'
}>(), {
  size: 'small',
})
</script>

<template>
  <span class="desktop-account-avatar" :class="`is-${size}`" aria-hidden="true">
    <DesktopIcon
      class="desktop-account-avatar__portrait"
      name="accountAvatar"
    />
  </span>
</template>

<style scoped>
.desktop-account-avatar {
  display: grid;
  flex: none;
  place-items: center;
  overflow: hidden;
  border-radius: 50%;
  background: var(--buddy-user-avatar-background);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--buddy-user-avatar-background) 72%, var(--buddy-border-base));
  color: var(--buddy-user-avatar-foreground);
}

.desktop-account-avatar.is-small {
  width: 32px;
  height: 32px;
}

.desktop-account-avatar.is-medium {
  width: 48px;
  height: 48px;
}

.desktop-account-avatar__portrait {
  width: 82%;
  height: 82%;
}
</style>
