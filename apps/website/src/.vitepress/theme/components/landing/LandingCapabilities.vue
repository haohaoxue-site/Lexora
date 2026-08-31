<script setup lang="ts">
import type { LandingCapabilitiesContent } from './landingContent'
import { computed } from 'vue'
import LandingCapabilityCard from './LandingCapabilityCard.vue'
import LandingSectionHeading from './LandingSectionHeading.vue'

const props = defineProps<{
  content: LandingCapabilitiesContent
}>()

const capabilityCards = computed(() => props.content.items.map((item, index) => ({
  index,
  item,
})))
</script>

<template>
  <section id="capabilities" class="capabilities">
    <div class="landing-container">
      <LandingSectionHeading
        :kicker="content.kicker"
        :title="content.title"
        :description="content.description"
        tone="light"
      />

      <div class="capabilities__grid">
        <LandingCapabilityCard
          v-for="card in capabilityCards"
          :key="card.item.visual"
          :item="card.item"
          :index="card.index"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.capabilities {
  position: relative;
  overflow: hidden;
  padding: clamp(100px, 11vw, 158px) 0;
  background:
    radial-gradient(circle at 12% 10%, color-mix(in srgb, var(--landing-highlight) 8%, transparent), transparent 30%),
    var(--landing-dark-canvas);
}

.capabilities::after {
  position: absolute;
  right: -100px;
  bottom: 15%;
  width: 300px;
  height: 300px;
  border: 1px solid color-mix(in srgb, var(--landing-highlight) 10%, transparent);
  border-radius: 50%;
  box-shadow:
    0 0 0 60px color-mix(in srgb, var(--landing-highlight) 2%, transparent),
    0 0 0 120px color-mix(in srgb, var(--landing-highlight) 1.2%, transparent);
  content: '';
  pointer-events: none;
}

.capabilities__grid {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 16px;
  margin-top: 72px;
  grid-template-columns: repeat(12, minmax(0, 1fr));
}

@media (max-width: 640px) {
  .capabilities__grid {
    margin-top: 52px;
  }
}
</style>
