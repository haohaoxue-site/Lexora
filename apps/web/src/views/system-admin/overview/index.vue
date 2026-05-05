<script setup lang="ts">
import ConsoleMetricCard from '../components/ConsoleMetricCard.vue'
import { useOverview } from './composables/useOverview'

const { overview, errorMessage, isLoading, metricCards } = useOverview()
</script>

<template>
  <div v-loading="isLoading" class="admin-overview">
    <ElAlert v-if="errorMessage" :title="errorMessage" type="error" show-icon :closable="false" class="rounded-xl" />

    <div v-else-if="overview" class="flex flex-col gap-6">
      <section class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ConsoleMetricCard
          v-for="card in metricCards"
          :key="card.label"
          :detail="card.detail"
          :label="card.label"
          :value="card.value"
          :icon-category="card.iconCategory"
          :icon="card.icon"
        />
      </section>
    </div>
  </div>
</template>
