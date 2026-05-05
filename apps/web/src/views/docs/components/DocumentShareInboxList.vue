<script setup lang="ts">
import type {
  DocumentShareInboxListEmits,
  DocumentShareInboxListProps,
} from '../typing'
import { getDocumentShareModeLabel } from '@haohaoxue/samepage-shared'
import CollabIdentityItem from '@/components/collab-identity/CollabIdentityItem.vue'

const props = defineProps<DocumentShareInboxListProps>()
const emits = defineEmits<DocumentShareInboxListEmits>()
</script>

<template>
  <div class="document-share-inbox-list">
    <div v-if="props.errorMessage" class="document-share-inbox-list__state">
      <ElEmpty :description="props.errorMessage">
        <ElButton type="primary" @click="emits('reload')">
          重新加载
        </ElButton>
      </ElEmpty>
    </div>

    <div v-else-if="props.isLoading" class="document-share-inbox-list__state">
      <ElSkeleton :rows="5" animated class="document-share-inbox-list__skeleton" />
    </div>

    <div v-else-if="!props.items.length" class="document-share-inbox-list__state">
      <ElEmpty :description="props.mode === 'pending' ? '暂无待接收分享。' : '还没有别人分享给你的文档。'" />
    </div>

    <ul v-else class="document-share-inbox-list__items">
      <li
        v-for="item in props.items"
        :key="item.recipient.id"
        class="document-share-inbox-list__item"
      >
        <div class="document-share-inbox-list__main">
          <button
            type="button"
            class="document-share-inbox-list__title-button"
            @click="emits('open', item.recipient.id)"
          >
            {{ item.documentTitle }}
          </button>

          <div class="document-share-inbox-list__meta">
            <div class="document-share-inbox-list__meta-line">
              来源：{{ item.workspaceType === 'TEAM' ? '团队空间' : '我的空间' }} · {{ item.workspaceName }}
            </div>

            <div class="document-share-inbox-list__meta-line">
              分享方式：{{ getDocumentShareModeLabel(item.share.mode) }}
            </div>
          </div>

          <CollabIdentityItem
            v-if="item.sharedByUser"
            :identity="item.sharedByUser"
            :avatar-size="38"
            class="document-share-inbox-list__identity"
          />
        </div>

        <div class="document-share-inbox-list__side">
          <ElButton
            v-if="props.mode === 'pending'"
            type="primary"
            :loading="props.actionRecipientId === item.recipient.id"
            @click="emits('accept', item.recipient.id)"
          >
            接受
          </ElButton>

          <ElButton
            v-if="props.mode === 'pending'"
            :disabled="props.actionRecipientId === item.recipient.id"
            @click="emits('decline', item.recipient.id)"
          >
            拒绝
          </ElButton>

          <ElButton
            v-else
            :disabled="props.actionRecipientId === item.recipient.id"
            @click="emits('open', item.recipient.id)"
          >
            打开文档
          </ElButton>

          <ElButton
            v-if="props.mode === 'active'"
            type="danger"
            plain
            :loading="props.actionRecipientId === item.recipient.id"
            @click="emits('exit', item.recipient.id)"
          >
            停止接收
          </ElButton>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
.document-share-inbox-list {
  min-height: 0;

  .document-share-inbox-list__state {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 18rem;
  }

  .document-share-inbox-list__skeleton {
    width: min(100%, 44rem);
    padding: 1.25rem;
    border-radius: 1rem;
    background: color-mix(in srgb, white 88%, var(--brand-bg-base));
  }

  .document-share-inbox-list__items {
    display: grid;
    gap: 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .document-share-inbox-list__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.1rem;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 76%, transparent);
    border-radius: 1rem;
    background: color-mix(in srgb, white 90%, var(--brand-bg-base));
    box-shadow: 0 18px 48px -40px rgba(31, 35, 41, 0.3);
  }

  .document-share-inbox-list__main {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
  }

  .document-share-inbox-list__title-button {
    padding: 0;
    border: none;
    background: transparent;
    color: var(--brand-text-primary);
    font-size: 1.05rem;
    font-weight: 700;
    line-height: 1.4;
    text-align: left;
    cursor: pointer;
  }

  .document-share-inbox-list__meta {
    display: grid;
    gap: 0.25rem;
  }

  .document-share-inbox-list__meta-line {
    color: var(--brand-text-secondary);
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .document-share-inbox-list__identity {
    min-width: 0;
  }

  .document-share-inbox-list__side {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    justify-content: flex-end;
  }
}
</style>
