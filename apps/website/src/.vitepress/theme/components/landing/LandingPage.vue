<script setup lang="ts">
import { useData } from 'vitepress'
import { computed } from 'vue'
import LandingCapabilities from './LandingCapabilities.vue'
import { landingContent } from './landingContent'
import LandingDocumentBridge from './LandingDocumentBridge.vue'
import LandingFinalCta from './LandingFinalCta.vue'
import LandingHero from './LandingHero.vue'
import LandingPrinciples from './LandingPrinciples.vue'
import LandingWorkflow from './LandingWorkflow.vue'

const { lang } = useData()
const content = computed(() => landingContent[lang.value.startsWith('en') ? 'en' : 'zh'])
</script>

<template>
  <main class="landing-page">
    <LandingHero :content="content.hero" />

    <div class="capability-ribbon" aria-hidden="true">
      <div class="capability-ribbon__track">
        <div v-for="set in 2" :key="set" class="capability-ribbon__set">
          <template v-for="item in content.ribbon" :key="`${set}-${item}`">
            <span>{{ item }}</span>
            <i />
          </template>
        </div>
      </div>
    </div>

    <LandingWorkflow :content="content.workflow" />
    <LandingCapabilities :content="content.capabilities" />
    <LandingDocumentBridge :content="content.document" />
    <LandingPrinciples :content="content.principles" />
    <LandingFinalCta :content="content.final" />
  </main>
</template>

<style scoped>
.landing-page {
  overflow: hidden;
  color: var(--landing-ink);
  font-family: var(--landing-font-body);
}

.capability-ribbon {
  overflow: hidden;
  border-top: 1px solid var(--landing-dark-border);
  border-bottom: 1px solid var(--landing-dark-border);
  background: var(--landing-dark-canvas);
  color: var(--landing-dark-muted);
}

.capability-ribbon__track {
  display: flex;
  width: max-content;
  animation: ribbon-scroll 34s linear infinite;
}

.capability-ribbon__set {
  display: flex;
  height: 54px;
  align-items: center;
  gap: 28px;
  padding-right: 28px;
}

.capability-ribbon span {
  font-family: var(--landing-font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  white-space: nowrap;
}

.capability-ribbon i {
  width: 5px;
  height: 5px;
  border: 1px solid var(--landing-highlight);
  border-radius: 50%;
}

@keyframes ribbon-scroll {
  to {
    transform: translateX(-50%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .capability-ribbon__track {
    animation: none;
  }
}
</style>
