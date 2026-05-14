<script setup lang="ts">
import type {
  SharedDocumentReaderPageProps,
} from '../typing'
import { DOCUMENT_SHARE_MODE } from '@haohaoxue/samepage-contracts'
import { computed } from 'vue'
import { DocumentContentSurface } from '@/components/tiptap-editor'

const props = defineProps<SharedDocumentReaderPageProps>()
const emits = defineEmits<{
  accept: []
  decline: []
}>()
const showAcceptBanner = computed(() =>
  props.access?.share.mode === DOCUMENT_SHARE_MODE.LOGGED_IN
  && props.access.recipientStatus !== 'ACTIVE',
)
const acceptLabel = computed(() =>
  props.access?.recipientStatus === 'DECLINED' || props.access?.recipientStatus === 'EXITED'
    ? '重新接收'
    : '接收到分享给我',
)
</script>

<template>
  <section class="shared-document-reader-page">
    <div v-if="showAcceptBanner && props.access" class="shared-document-reader-page__banner">
      <div class="shared-document-reader-page__banner-text">
        当前链接可直接阅读；显式接收后，这篇文档才会进入“分享给我”。
      </div>

      <div class="shared-document-reader-page__banner-actions">
        <ElButton type="primary" size="small" :loading="props.isActionPending" @click="emits('accept')">
          {{ acceptLabel }}
        </ElButton>

        <ElButton size="small" :disabled="props.isActionPending" @click="emits('decline')">
          暂不接收
        </ElButton>
      </div>
    </div>

    <div class="shared-document-reader-page__surface">
      <DocumentContentSurface
        :document-id="props.document.id"
        :title="props.document.title"
        :body="props.document.body"
        :page-width-mode="props.document.pageWidthMode"
        :editable="false"
        :active-block-id="props.activeBlockId"
        :show-outline="false"
      />
    </div>
  </section>
</template>

<style scoped lang="scss">
.shared-document-reader-page {
  display: flex;
  flex-direction: column;
  flex: 1 1 0%;
  min-height: 0;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--brand-primary) 4%, white) 0%,
      var(--brand-bg-base) 18%,
      var(--brand-bg-base) 100%
    );

  .shared-document-reader-page__banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin: 1rem 1rem 0;
    padding: 0.85rem 1rem;
    border: 1px solid color-mix(in srgb, var(--brand-primary) 18%, transparent);
    border-radius: 0.9rem;
    background: color-mix(in srgb, var(--brand-primary) 7%, white);
  }

  .shared-document-reader-page__banner-text {
    color: var(--brand-text-primary);
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .shared-document-reader-page__banner-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
  }

  .shared-document-reader-page__surface {
    min-height: 0;
    height: 100%;
    flex: 1 1 0%;
    padding: 1rem;

    :deep(.document-content-surface) {
      border: 1px solid color-mix(in srgb, var(--brand-border-base) 76%, transparent);
      border-radius: 1rem;
      overflow: hidden;
      box-shadow: 0 18px 48px -36px rgba(31, 35, 41, 0.32);
    }
  }
}
</style>
