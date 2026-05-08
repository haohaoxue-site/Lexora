<script setup lang="ts">
import PagePanel from '@/layouts/panels/PagePanel.vue'

const pageTitle = '日程'
</script>

<template>
  <PagePanel>
    <template #header>
      <div class="schedule-view-context">
        <div class="schedule-view-context__title">
          {{ pageTitle }}
        </div>
      </div>
    </template>

    <section class="schedule-view__empty">
      <ElEmpty description="日程正在建设中">
        <template #image>
          <div class="schedule-view__empty-icon">
            <SvgIcon category="nav" icon="schedule-active" size="4rem" />
          </div>
        </template>
      </ElEmpty>
    </section>
  </PagePanel>
</template>

<style scoped lang="scss">
.schedule-view-context {
  .schedule-view-context__title {
    color: var(--brand-text-primary);
    font-size: 1.5rem;
    font-weight: 600;
    line-height: 2rem;
  }
}

.schedule-view__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-height: 100%;
  padding: 3rem 1.5rem;

  .schedule-view__empty-icon {
    margin: 0 auto;
    width: 5.5rem;
    height: 5.5rem;
    border: 1px solid color-mix(in srgb, #f59e0b 18%, transparent);
    border-radius: 1.75rem;
    background:
      radial-gradient(circle at top, rgba(255, 255, 255, 0.92), transparent 58%),
      linear-gradient(160deg, #fff7ed 0%, #f0fbff 50%, #fffbea 100%);
    box-shadow: 0 20px 44px rgba(183, 113, 35, 0.12);
  }

  :deep(.el-empty__description) {
    margin-top: 1rem;
    color: var(--brand-text-primary);
    font-size: 1.5rem;
    font-weight: 600;
    line-height: 2rem;
  }
}
</style>
