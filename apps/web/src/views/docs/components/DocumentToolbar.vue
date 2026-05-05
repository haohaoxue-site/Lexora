<script setup lang="ts">
import type {
  DocumentToolbarEmits,
  DocumentToolbarProps,
} from '../typing'

const props = defineProps<DocumentToolbarProps>()

defineEmits<DocumentToolbarEmits>()
</script>

<template>
  <ElButton
    text
    class="document-tree-toolbar document-tree-toolbar__button"
    :disabled="props.isBusy"
    title="新建文档"
    @click="$emit('createRoot', props.collectionId)"
  >
    <SvgIcon category="ui" :icon="props.isBusy ? 'spinner-orbit' : 'plus'" size="1rem" :class="{ 'animate-spin': props.isBusy }" />
  </ElButton>
</template>

<style scoped lang="scss">
.document-tree-toolbar {
  &.document-tree-toolbar__button {
    --el-button-text-color: var(--brand-text-secondary);
    --el-button-hover-text-color: var(--brand-primary);
    --el-button-hover-bg-color: var(--brand-bg-surface-raised);
    --el-button-border-color: transparent;
    --el-button-hover-border-color: transparent;
    color: var(--brand-text-secondary);
    width: 1.75rem;
    min-width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border-radius: 0.5rem;

    &:hover {
      color: var(--brand-primary);
      background: var(--brand-bg-surface-raised);
    }

    &:disabled {
      opacity: 0.4;
    }
  }
}
</style>
