<script setup lang="ts">
import Empty from '@/components/empty'
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
      <Empty title="日程正在建设中" description="" />
    </section>
  </PagePanel>
</template>
