<script setup lang="ts">
import type { LandingPrinciplesContent } from './landingContent'
import { computed } from 'vue'
import LandingSectionHeading from './LandingSectionHeading.vue'

const props = defineProps<{
  content: LandingPrinciplesContent
}>()

const numberedPrinciples = computed(() => props.content.items.map((item, index) => ({
  item,
  number: String(index + 1).padStart(2, '0'),
})))
</script>

<template>
  <section class="principles">
    <div class="landing-container principles__inner">
      <LandingSectionHeading
        :kicker="content.kicker"
        :title="content.title"
        :description="content.description"
      />

      <ol class="principles__list">
        <li v-for="principle in numberedPrinciples" :key="principle.item.title">
          <div class="principles__number">
            <span>{{ principle.number }}</span>
            <svg aria-hidden="true" viewBox="0 0 56 56">
              <circle cx="28" cy="28" r="23" />
              <path d="M28 1v8M28 47v8M1 28h8M47 28h8" />
            </svg>
          </div>
          <div>
            <h3>{{ principle.item.title }}</h3>
            <p>{{ principle.item.description }}</p>
          </div>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
.principles {
  padding: clamp(96px, 11vw, 154px) 0;
  background: var(--landing-surface);
}

.principles__inner {
  display: grid;
  grid-template-columns: minmax(0, 0.86fr) minmax(520px, 1.14fr);
  gap: clamp(64px, 10vw, 150px);
}

.principles__list {
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--landing-border-strong);
  list-style: none;
}

.principles__list li {
  display: grid;
  align-items: start;
  grid-template-columns: 70px 1fr;
  gap: 24px;
  padding: 28px 0 30px;
  border-bottom: 1px solid var(--landing-border);
}

.principles__number {
  position: relative;
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
}

.principles__number span {
  color: var(--landing-accent-strong);
  font-family: var(--landing-font-mono);
  font-size: 10px;
  font-weight: 700;
}

.principles__number svg {
  position: absolute;
  inset: 0;
  fill: none;
  stroke: color-mix(in srgb, var(--landing-accent) 45%, var(--landing-border));
  stroke-width: 1;
}

.principles__list h3 {
  margin: 0;
  color: var(--landing-ink);
  font-family: var(--landing-font-display);
  font-size: 27px;
  font-weight: 600;
  letter-spacing: -0.025em;
  line-height: 1.2;
}

.principles__list p {
  margin: 10px 0 0;
  color: var(--landing-muted);
  font-size: 14px;
  line-height: 1.75;
}

@media (max-width: 900px) {
  .principles__inner {
    grid-template-columns: 1fr;
    gap: 56px;
  }
}

@media (max-width: 640px) {
  .principles__list li {
    grid-template-columns: 48px 1fr;
    gap: 14px;
  }

  .principles__number {
    width: 42px;
    height: 42px;
  }
}
</style>
