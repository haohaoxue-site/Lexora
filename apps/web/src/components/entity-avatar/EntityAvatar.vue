<script setup lang="ts">
import type { EntityAvatarProps } from './typing'
import { useEntityAvatar } from './useEntityAvatar'

const props = withDefaults(defineProps<EntityAvatarProps>(), {
  src: null,
  alt: '',
  size: 40,
  shape: 'circle',
  kind: 'user',
})

const {
  avatarAlt,
  avatarInitial,
  avatarStyle,
  handleImageError,
  resolvedSrc,
} = useEntityAvatar(props)
</script>

<template>
  <div
    class="entity-avatar"
    :class="[
      `entity-avatar--${props.shape}`,
      `entity-avatar--${props.kind}`,
    ]"
    :style="avatarStyle"
    role="img"
  >
    <img
      v-if="resolvedSrc"
      :key="resolvedSrc"
      :src="resolvedSrc"
      :alt="avatarAlt"
      referrerpolicy="no-referrer"
      class="entity-avatar__image"
      @error="handleImageError"
    >

    <span v-else class="entity-avatar__fallback">
      {{ avatarInitial }}
    </span>
  </div>
</template>

<style scoped lang="scss">
.entity-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  color: color-mix(in srgb, var(--brand-text-primary) 84%, var(--brand-primary) 16%);
  user-select: none;

  &--circle {
    border-radius: 9999px;
  }

  &--rounded {
    border-radius: 0.9em;
  }

  &--user {
    background:
      radial-gradient(circle at 30% 28%, color-mix(in srgb, white 72%, transparent), transparent 46%),
      linear-gradient(
        135deg,
        color-mix(in srgb, var(--brand-fill-light) 88%, var(--brand-bg-surface)),
        color-mix(in srgb, var(--brand-fill-base) 76%, var(--brand-bg-surface-raised))
      );
  }

  &--workspace {
    background:
      radial-gradient(circle at 30% 24%, color-mix(in srgb, white 74%, transparent), transparent 44%),
      linear-gradient(
        135deg,
        color-mix(in srgb, var(--brand-primary) 16%, white 84%),
        color-mix(in srgb, var(--brand-fill-base) 64%, var(--brand-bg-surface-raised))
      );
  }

  &__image {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &__fallback {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    font-weight: 700;
    line-height: 1;
  }
}
</style>
