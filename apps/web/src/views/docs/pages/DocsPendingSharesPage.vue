<script setup lang="ts">
import DocumentShareInboxList from '../components/DocumentShareInboxList.vue'
import { useDocsShareInboxPage } from '../composables/useDocsShareInboxPage'

const {
  items,
  isLoading,
  errorMessage,
  actionRecipientId,
  loadItems,
  openItem,
  acceptItem,
  declineItem,
} = useDocsShareInboxPage({
  mode: 'pending',
})
</script>

<template>
  <section class="docs-share-page">
    <DocumentShareInboxList
      mode="pending"
      :items="items"
      :is-loading="isLoading"
      :error-message="errorMessage"
      :action-recipient-id="actionRecipientId"
      @reload="loadItems"
      @open="openItem"
      @accept="acceptItem"
      @decline="declineItem"
    />
  </section>
</template>

<style scoped lang="scss">
.docs-share-page {
  flex: 1 1 0%;
  min-height: 0;
  padding: clamp(1.25rem, 2vw, 1.75rem);
  background: var(--brand-bg-base);
}
</style>
