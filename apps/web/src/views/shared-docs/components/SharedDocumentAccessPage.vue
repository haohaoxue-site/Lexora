<script setup lang="ts">
import type {
  SharedDocumentAccessPageEmits,
  SharedDocumentAccessPageProps,
} from '../typing'
import { getDocumentShareModeLabel } from '@haohaoxue/samepage-shared'
import { computed } from 'vue'
import CollabIdentityItem from '@/components/collab-identity/CollabIdentityItem.vue'

const props = defineProps<SharedDocumentAccessPageProps>()
const emits = defineEmits<SharedDocumentAccessPageEmits>()
const acceptLabel = computed(() =>
  props.access.recipientStatus === 'DECLINED' || props.access.recipientStatus === 'EXITED'
    ? '重新接收'
    : '确认接收',
)
const shareModeLabel = computed(() =>
  getDocumentShareModeLabel(props.access.share.mode),
)
const recipientStatusLabel = computed(() => {
  if (props.access.recipientStatus === 'DECLINED') {
    return '已拒绝，可重新接收'
  }

  if (props.access.recipientStatus === 'EXITED') {
    return '已退出，可重新接收'
  }

  return '等待确认'
})
</script>

<template>
  <section class="shared-document-access-page">
    <div class="shared-document-access-page__panel">
      <div class="shared-document-access-page__eyebrow">
        {{ shareModeLabel }}
      </div>

      <h1 class="shared-document-access-page__title">
        {{ props.access.documentTitle }}
      </h1>

      <p class="shared-document-access-page__description">
        确认后即可在独立页面查看这篇文档。
      </p>

      <ElDescriptions :column="1" direction="vertical" size="small" class="shared-document-access-page__meta">
        <ElDescriptionsItem label="来源">
          {{ props.access.workspaceType === 'TEAM' ? '团队空间' : '我的空间' }} · {{ props.access.workspaceName }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="发起人">
          <template v-if="props.access.sharedByUser">
            <CollabIdentityItem
              :identity="props.access.sharedByUser"
              :avatar-size="36"
              class="shared-document-access-page__identity"
            />
          </template>
          <template v-else>
            未知用户
          </template>
        </ElDescriptionsItem>
        <ElDescriptionsItem label="当前状态">
          {{ recipientStatusLabel }}
        </ElDescriptionsItem>
      </ElDescriptions>

      <div class="shared-document-access-page__actions">
        <ElButton
          type="primary"
          :loading="props.isActionPending"
          @click="emits('accept')"
        >
          {{ acceptLabel }}
        </ElButton>

        <ElButton
          :disabled="props.isActionPending"
          @click="emits('decline')"
        >
          暂不接收
        </ElButton>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.shared-document-access-page {
  display: flex;
  flex: 1 1 0%;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: clamp(1.5rem, 4vw, 3rem);
  background:
    radial-gradient(circle at top, color-mix(in srgb, var(--brand-primary) 10%, transparent) 0%, transparent 48%),
    linear-gradient(180deg, color-mix(in srgb, var(--brand-primary) 3%, white) 0%, var(--brand-bg-base) 100%);

  .shared-document-access-page__panel {
    display: grid;
    gap: 1rem;
    width: min(100%, 34rem);
    padding: clamp(1.5rem, 4vw, 2rem);
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 72%, transparent);
    border-radius: 1.25rem;
    background: color-mix(in srgb, white 88%, var(--brand-bg-surface));
    box-shadow: 0 28px 60px -42px rgba(31, 35, 41, 0.4);
  }

  .shared-document-access-page__eyebrow {
    color: var(--brand-primary);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .shared-document-access-page__title {
    margin: 0;
    color: var(--brand-text-primary);
    font-size: clamp(1.6rem, 4vw, 2rem);
    font-weight: 700;
    line-height: 1.15;
  }

  .shared-document-access-page__description {
    margin: 0;
    color: var(--brand-text-secondary);
    font-size: 0.95rem;
    line-height: 1.7;
  }

  .shared-document-access-page__meta {
    margin: 0;
    padding: 1rem;
    border-radius: 1rem;
    background: color-mix(in srgb, var(--brand-fill-light) 58%, white);

    :deep(.el-descriptions__body) {
      background: transparent;
    }

    :deep(.el-descriptions__table) {
      width: 100%;
    }

    :deep(.el-descriptions__cell) {
      padding-bottom: 0.85rem;
    }

    :deep(.el-descriptions__cell:last-child) {
      padding-bottom: 0;
    }

    :deep(.el-descriptions__label) {
      margin-bottom: 0.35rem;
      color: var(--brand-text-secondary);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.04em;
    }

    :deep(.el-descriptions__content) {
      color: var(--brand-text-primary);
      font-size: 0.95rem;
      line-height: 1.6;
    }
  }

  .shared-document-access-page__identity {
    min-width: 0;
  }

  .shared-document-access-page__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
}
</style>
