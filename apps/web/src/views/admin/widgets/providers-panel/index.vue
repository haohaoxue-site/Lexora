<script setup lang="ts">
import AiProviderConsole from '@/components/ai-provider-console'
import PagePanel from '@/layouts/panels/page-panel'
import AdminPageHeader from '../../components/page-header'
import PlatformModelSettingsPanel from '../../components/platform-model-settings-panel'
import { useAdminPlatformEmbeddingModel } from '../../composables/useAdminPlatformEmbeddingModel'

const {
  platformModelSettingsVisible,
  platformEmbeddingModelPolicy,
  platformEmbeddingModelRef,
  isPlatformEmbeddingModelLoading,
  isPlatformEmbeddingModelSaving,
  openPlatformModelSettings,
  updatePlatformEmbeddingModel,
} = useAdminPlatformEmbeddingModel()
</script>

<template>
  <PagePanel>
    <template #header>
      <div class="admin-providers-page__header flex min-w-0 flex-1 items-center justify-between gap-3">
        <AdminPageHeader title="服务商" />
        <ElTooltip content="平台模型配置" placement="bottom" effect="dark" :show-after="300">
          <ElButton
            text
            class="admin-providers-page__settings-button h-8 min-w-8 w-8 p-0"
            aria-label="平台模型配置"
            @click="openPlatformModelSettings"
          >
            <SvgIcon category="ui" icon="settings-gear" size="1rem" />
          </ElButton>
        </ElTooltip>
      </div>
    </template>

    <div class="admin-providers-page h-full min-h-0 bg-fill-lighter p-4 lg:p-6">
      <AiProviderConsole class="admin-providers h-full min-h-0" mode="platform" />
    </div>

    <PlatformModelSettingsPanel
      v-model:visible="platformModelSettingsVisible"
      :model-policy="platformEmbeddingModelPolicy"
      :model-ref="platformEmbeddingModelRef"
      :loading="isPlatformEmbeddingModelLoading"
      :saving="isPlatformEmbeddingModelSaving"
      @update-model="updatePlatformEmbeddingModel"
    />
  </PagePanel>
</template>

<style scoped lang="scss">
.admin-providers-page__settings-button {
  color: var(--brand-text-secondary);
  border-radius: 0.5rem;

  &:hover {
    color: var(--brand-primary);
    background: color-mix(in srgb, var(--brand-primary) 8%, transparent);
  }
}
</style>
