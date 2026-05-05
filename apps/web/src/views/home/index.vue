<script setup lang="ts">
import WorkspacePage from '@/layouts/components/WorkspacePage.vue'
import HomeSchedulePanel from './components/HomeSchedulePanel.vue'
import HomeWelcomePanel from './components/HomeWelcomePanel.vue'
import HomeWidgetSettingsPopover from './components/HomeWidgetSettingsPopover.vue'
import RecentDocumentList from './components/RecentDocumentList.vue'
import { useHome } from './composables/useHome'

const {
  overview,
  schedules,
  recentDocuments,
  widgetDefinitions,
  visibleWidgets,
  visibleWidgetSet,
  toggleWidget,
} = useHome()
</script>

<template>
  <WorkspacePage>
    <template #context>
      <div class="home-view-context">
        <div class="home-view-context__copy">
          <div class="home-view-context__title">
            主页
          </div>
        </div>

        <div class="home-view-context__actions">
          <HomeWidgetSettingsPopover
            :widgets="widgetDefinitions"
            :visible-widget-set="visibleWidgetSet"
            @toggle="toggleWidget"
          />
        </div>
      </div>
    </template>

    <div class="home-view">
      <div class="home-view__content">
        <HomeWelcomePanel
          v-if="visibleWidgetSet.has('welcome')"
          :overview="overview"
        />

        <div class="home-view__grid">
          <RecentDocumentList
            v-if="visibleWidgetSet.has('recent-documents')"
            :documents="recentDocuments"
          />

          <HomeSchedulePanel
            v-if="visibleWidgetSet.has('schedule')"
            :schedules="schedules"
          />
        </div>

        <ElEmpty
          v-if="visibleWidgets.length === 0"
          :image-size="56"
          description="当前已隐藏全部模块，请点击右上角设置按钮重新选择。"
          class="home-view__empty"
        />
      </div>
    </div>
  </WorkspacePage>
</template>

<style scoped lang="scss">
.home-view-context {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;

  .home-view-context__copy {
    min-width: 0;
  }

  .home-view-context__title {
    color: var(--brand-text-primary);
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: -0.025em;
    line-height: 2rem;
  }

  .home-view-context__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }
}

.home-view {
  max-width: 80rem;
  margin-inline: auto;
  padding: 1.5rem;

  .home-view__content {
    > * + * {
      margin-top: 1.5rem;
    }
  }

  .home-view__grid {
    display: grid;
    gap: 1.5rem;

    @media (min-width: 1280px) {
      grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
    }
  }

  .home-view__empty {
    padding-block: 3rem;
    border: 1px dashed color-mix(in srgb, var(--brand-border-base) 80%, transparent);
    border-radius: 1.75rem;
    background: var(--brand-bg-surface-raised);
  }
}
</style>
