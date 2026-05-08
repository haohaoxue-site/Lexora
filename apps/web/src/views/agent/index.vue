<script setup lang="ts">
import PagePanel from '@/layouts/panels/PagePanel.vue'

const pageTitle = '智能体'
</script>

<template>
  <PagePanel>
    <template #header>
      <div class="agent-view-context">
        <div class="agent-view-context__title">
          {{ pageTitle }}
        </div>
      </div>
    </template>

    <section class="agent-view__empty">
      <ElEmpty description="智能体正在建设中">
        <template #image>
          <div class="agent-view__empty-icon">
            <SvgIcon category="nav" icon="model-service-active" size="4rem" />
          </div>
        </template>
      </ElEmpty>
    </section>
  </PagePanel>
</template>

<style scoped lang="scss">
.agent-view-context {
  .agent-view-context__title {
    color: var(--brand-text-primary);
    font-size: 1.5rem;
    font-weight: 600;
    line-height: 2rem;
  }
}

.agent-view__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-height: 100%;
  padding: 3rem 1.5rem;

  .agent-view__empty-icon {
    margin: 0 auto;
    width: 5.5rem;
    height: 5.5rem;
    border: 1px solid color-mix(in srgb, #768cff 18%, transparent);
    border-radius: 1.75rem;
    background:
      radial-gradient(circle at top, rgba(255, 255, 255, 0.92), transparent 58%),
      linear-gradient(160deg, #f2f7ff 0%, #f7f4ff 48%, #fff2f7 100%);
    box-shadow: 0 20px 44px rgba(88, 107, 201, 0.12);
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
