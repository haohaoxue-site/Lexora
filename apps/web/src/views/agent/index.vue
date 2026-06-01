<script setup lang="ts">
import PagePanel from '@/layouts/panels/page-panel'

const pageTitle = '智能体'
</script>

<template>
  <PagePanel>
    <template #header>
      <div class="agent-view-context">
        <div class="agent-view-context__title text-2xl font-semibold leading-8 text-main">
          {{ pageTitle }}
        </div>
      </div>
    </template>

    <section class="agent-view__empty box-border flex min-h-full items-center justify-center px-6 py-12">
      <ElEmpty>
        <template #image>
          <div class="agent-view__empty-icon mx-auto h-[5.5rem] w-[5.5rem] rounded-[1.75rem] border">
            <SvgIcon category="nav" icon="model-service-active" size="4rem" />
          </div>
        </template>
        <template #description>
          <p class="m-0 mt-4 text-2xl font-semibold leading-8 text-main">
            智能体正在建设中
          </p>
        </template>
      </ElEmpty>
    </section>
  </PagePanel>
</template>

<style scoped lang="scss">
.agent-view__empty {
  .agent-view__empty-icon {
    border: 1px solid color-mix(in srgb, #768cff 18%, transparent);
    background:
      radial-gradient(circle at top, rgba(255, 255, 255, 0.92), transparent 58%),
      linear-gradient(160deg, #f2f7ff 0%, #f7f4ff 48%, #fff2f7 100%);
    box-shadow: 0 20px 44px rgba(88, 107, 201, 0.12);
  }
}
</style>
