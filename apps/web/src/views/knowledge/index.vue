<script setup lang="ts">
import PagePanel from '@/layouts/panels/page-panel'

const pageTitle = '知识库'
</script>

<template>
  <PagePanel>
    <template #header>
      <div class="knowledge-view-context">
        <div class="knowledge-view-context__title text-2xl font-semibold leading-8 text-main">
          {{ pageTitle }}
        </div>
      </div>
    </template>

    <section class="knowledge-view__empty box-border flex min-h-full items-center justify-center px-6 py-12">
      <ElEmpty>
        <template #image>
          <div class="knowledge-view__empty-icon mx-auto h-[5.5rem] w-[5.5rem] rounded-[1.75rem] border">
            <SvgIcon category="nav" icon="knowledge-active" size="4rem" />
          </div>
        </template>
        <template #description>
          <p class="m-0 mt-4 text-2xl font-semibold leading-8 text-main">
            知识库正在建设中
          </p>
        </template>
      </ElEmpty>
    </section>
  </PagePanel>
</template>

<style scoped lang="scss">
.knowledge-view__empty {
  .knowledge-view__empty-icon {
    border: 1px solid color-mix(in srgb, var(--brand-primary) 16%, transparent);
    background:
      radial-gradient(circle at top, rgba(255, 255, 255, 0.92), transparent 58%),
      linear-gradient(160deg, #f3fffa 0%, #effbf6 42%, #f8ffed 100%);
    box-shadow: 0 20px 44px rgba(52, 114, 88, 0.12);
  }
}
</style>
