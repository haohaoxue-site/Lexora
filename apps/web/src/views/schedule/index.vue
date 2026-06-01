<script setup lang="ts">
import PagePanel from '@/layouts/panels/page-panel'

const pageTitle = '日程'
</script>

<template>
  <PagePanel>
    <template #header>
      <div class="schedule-view-context">
        <div class="schedule-view-context__title text-2xl font-semibold leading-8 text-main">
          {{ pageTitle }}
        </div>
      </div>
    </template>

    <section class="schedule-view__empty box-border flex min-h-full items-center justify-center px-6 py-12">
      <ElEmpty>
        <template #image>
          <div class="schedule-view__empty-icon mx-auto h-[5.5rem] w-[5.5rem] rounded-[1.75rem] border">
            <SvgIcon category="nav" icon="schedule-active" size="4rem" />
          </div>
        </template>
        <template #description>
          <p class="m-0 mt-4 text-2xl font-semibold leading-8 text-main">
            日程正在建设中
          </p>
        </template>
      </ElEmpty>
    </section>
  </PagePanel>
</template>

<style scoped lang="scss">
.schedule-view__empty {
  .schedule-view__empty-icon {
    border: 1px solid color-mix(in srgb, #f59e0b 18%, transparent);
    background:
      radial-gradient(circle at top, rgba(255, 255, 255, 0.92), transparent 58%),
      linear-gradient(160deg, #fff7ed 0%, #f0fbff 50%, #fffbea 100%);
    box-shadow: 0 20px 44px rgba(183, 113, 35, 0.12);
  }
}
</style>
