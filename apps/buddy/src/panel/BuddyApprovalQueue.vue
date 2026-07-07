<script setup lang="ts">
import type { BuddyApprovalViewRow } from '@/panel/approvalView'
import { computed } from 'vue'

const props = defineProps<{
  isLoading: boolean
  isResolvingApproval: boolean
  rows: ReadonlyArray<BuddyApprovalViewRow>
}>()

const emit = defineEmits<{
  approveApproval: [approvalId: string, approvalKind: string]
  denyApproval: [approvalId: string]
}>()

const canResolve = computed(() => !props.isResolvingApproval && !props.isLoading)
</script>

<template>
  <section class="buddy-approval">
    <h2 class="buddy-approval__title">
      审批队列
    </h2>

    <ul
      v-if="rows.length > 0"
      class="buddy-approval__list"
    >
      <li
        v-for="row in rows"
        :key="row.id"
        class="buddy-approval__item"
      >
        <div class="buddy-approval__main">
          <span class="buddy-approval__kind">{{ row.kindLabel }}</span>
          <span class="buddy-approval__status">{{ row.statusLabel }}</span>
        </div>

        <p class="buddy-approval__prompt">
          {{ row.promptPreview }}
        </p>

        <div class="buddy-approval__meta">
          <span>{{ row.methodLabel }}</span>
          <span>{{ row.scopeStatusLabel }}</span>
          <span>目标：{{ row.targetLabel }}</span>
          <span>{{ row.scopeLabel }}</span>
          <span>{{ row.createdAt }}</span>
          <span v-if="row.runId">{{ row.runId }}</span>
        </div>

        <div class="buddy-approval__actions">
          <button
            class="buddy-approval__button buddy-approval__button--primary"
            type="button"
            :disabled="!canResolve || !row.canApprove"
            @click="emit('approveApproval', row.id, row.kind)"
          >
            {{ row.approveLabel }}
          </button>

          <button
            class="buddy-approval__button"
            type="button"
            :disabled="!canResolve || !row.canDeny"
            @click="emit('denyApproval', row.id)"
          >
            拒绝
          </button>
        </div>
      </li>
    </ul>

    <p
      v-else
      class="buddy-approval__empty"
    >
      暂无待处理审批
    </p>
  </section>
</template>

<style scoped lang="scss">
.buddy-approval {
  border: 1px solid var(--buddy-border-light);
  border-radius: 8px;
  background: var(--buddy-bg-surface);
  padding: 20px;
}

.buddy-approval__title {
  margin: 0 0 16px;
  color: var(--buddy-text-primary);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
}

.buddy-approval__list {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
}

.buddy-approval__item {
  display: grid;
  gap: 10px;
  border: 1px solid var(--buddy-border-light);
  border-radius: 8px;
  background: var(--buddy-fill-light);
  list-style: none;
  padding: 12px;
}

.buddy-approval__main,
.buddy-approval__meta,
.buddy-approval__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.buddy-approval__main {
  align-items: center;
  justify-content: space-between;
}

.buddy-approval__kind {
  color: var(--buddy-text-primary);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}

.buddy-approval__status {
  border: 1px solid var(--buddy-border-base);
  border-radius: 999px;
  color: var(--buddy-text-secondary);
  font-size: 12px;
  line-height: 1;
  padding: 5px 8px;
}

.buddy-approval__prompt {
  margin: 0;
  color: var(--buddy-text-primary);
  font-size: 14px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.buddy-approval__meta {
  color: var(--buddy-text-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.buddy-approval__actions {
  justify-content: flex-end;
}

.buddy-approval__button {
  min-width: 72px;
  border: 1px solid var(--buddy-border-base);
  border-radius: 8px;
  background: var(--buddy-bg-surface);
  color: var(--buddy-text-primary);
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  line-height: 1;
  padding: 10px 14px;
}

.buddy-approval__button--primary {
  min-width: 104px;
  background: var(--buddy-accent-primary);
  color: var(--buddy-text-on-accent);
}

.buddy-approval__button:disabled {
  cursor: not-allowed;
  opacity: 0.54;
}

.buddy-approval__empty {
  margin: 0;
  color: var(--buddy-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}
</style>
