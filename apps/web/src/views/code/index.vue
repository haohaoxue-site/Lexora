<script setup lang="ts">
import PagePanel from '@/layouts/panels/page-panel'

const pageTitle = '代码'
</script>

<template>
  <PagePanel>
    <template #header>
      <div class="code-view-context">
        <div class="code-view-context__title text-2xl font-semibold leading-8 text-main">
          {{ pageTitle }}
        </div>
      </div>
    </template>

    <section class="code-view__empty box-border flex min-h-full items-center justify-center px-6 py-12">
      <ElEmpty>
        <template #image>
          <div class="code-view__empty-icon mx-auto h-[5.5rem] w-[5.5rem] rounded-[1.75rem] border">
            <SvgIcon category="nav" icon="code-active" size="4rem" />
          </div>
        </template>
        <template #description>
          <p class="m-0 mt-4 text-2xl font-semibold leading-8 text-main">
            代码正在建设中
          </p>
        </template>
      </ElEmpty>
    </section>
  </PagePanel>
</template>

<style scoped lang="scss">
.code-view__empty {
  .code-view__empty-icon {
    border: 1px solid color-mix(in srgb, #6b95ff 18%, transparent);
    background:
      radial-gradient(circle at top, rgba(255, 255, 255, 0.92), transparent 58%),
      linear-gradient(160deg, #f2faff 0%, #f5f4ff 48%, #fff2f8 100%);
    box-shadow: 0 20px 44px rgba(80, 105, 196, 0.12);
  }
}
</style>
