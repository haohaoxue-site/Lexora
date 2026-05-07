<script setup lang="ts">
import WorkspacePage from '@/layouts/components/WorkspacePage.vue'
import HomeSchedulePanel from './components/HomeSchedulePanel.vue'
import HomeWelcomePanel from './components/HomeWelcomePanel.vue'
import RecentDocumentList from './components/RecentDocumentList.vue'
import { useHome } from './composables/useHome'

const {
  overview,
  schedules,
  recentDocuments,
} = useHome()
</script>

<template>
  <WorkspacePage>
    <template #context>
      <h1 class="home-view-context">
        主页
      </h1>
    </template>

    <div class="home-view">
      <div class="home-view__content">
        <HomeWelcomePanel
          :overview="overview"
        />

        <div class="home-view__grid">
          <RecentDocumentList
            :documents="recentDocuments"
          />

          <HomeSchedulePanel
            :schedules="schedules"
          />
        </div>
      </div>
    </div>
  </WorkspacePage>
</template>

<style scoped lang="scss">
.home-view-context {
  margin: 0;
  color: var(--brand-text-primary);
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 2rem;
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
}
</style>
