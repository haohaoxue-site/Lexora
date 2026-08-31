<script setup lang="ts">
import type { LandingWorkflowContent } from './landingContent'
import { computed } from 'vue'
import LandingSectionHeading from './LandingSectionHeading.vue'

const props = defineProps<{
  content: LandingWorkflowContent
}>()

const numberedSteps = computed(() => props.content.steps.map((step, index) => ({
  number: String(index + 1).padStart(2, '0'),
  step,
})))
</script>

<template>
  <section id="workflow" class="workflow">
    <div class="landing-container">
      <LandingSectionHeading
        :kicker="content.kicker"
        :title="content.title"
        :description="content.description"
        align="center"
      />

      <ol class="workflow__steps">
        <li v-for="item in numberedSteps" :key="item.step.meta" class="workflow__step">
          <div class="workflow__rail" aria-hidden="true">
            <span>{{ item.number }}</span>
          </div>
          <div class="workflow__body">
            <p>{{ item.step.meta }}</p>
            <h3>{{ item.step.title }}</h3>
            <span>{{ item.step.description }}</span>
          </div>
          <svg class="workflow__arrow" aria-hidden="true" viewBox="0 0 42 18">
            <path d="M1 9h38M32 2l7 7-7 7" />
          </svg>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
.workflow {
  position: relative;
  padding: clamp(96px, 11vw, 154px) 0;
  background: var(--landing-surface);
}

.workflow::before {
  position: absolute;
  top: 0;
  left: 50%;
  width: min(1280px, calc(100% - 48px));
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--landing-border-strong), transparent);
  content: '';
  transform: translateX(-50%);
}

.workflow__steps {
  display: grid;
  margin: 76px 0 0;
  padding: 0;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  list-style: none;
}

.workflow__step {
  position: relative;
  min-width: 0;
  padding: 0 28px;
  border-left: 1px solid var(--landing-border);
}

.workflow__step:first-child {
  padding-left: 0;
  border-left: 0;
}

.workflow__step:last-child {
  padding-right: 0;
}

.workflow__rail {
  position: relative;
  display: flex;
  height: 48px;
  align-items: center;
}

.workflow__rail::after {
  width: 100%;
  height: 1px;
  background: var(--landing-border-strong);
  content: '';
}

.workflow__rail span {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--landing-border-strong);
  border-radius: 50%;
  background: var(--landing-surface);
  color: var(--landing-accent-strong);
  font-family: var(--landing-font-mono);
  font-size: 10px;
  font-weight: 700;
}

.workflow__body {
  padding-top: 22px;
}

.workflow__body p {
  margin: 0 0 12px;
  color: var(--landing-faint);
  font-family: var(--landing-font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.16em;
}

.workflow__body h3 {
  margin: 0;
  color: var(--landing-ink);
  font-family: var(--landing-font-display);
  font-size: clamp(22px, 2.2vw, 30px);
  font-weight: 600;
  letter-spacing: -0.025em;
  line-height: 1.15;
}

.workflow__body > span {
  display: block;
  margin-top: 14px;
  color: var(--landing-muted);
  font-size: 14px;
  line-height: 1.75;
}

.workflow__arrow {
  position: absolute;
  top: 15px;
  right: 9px;
  width: 28px;
  fill: none;
  stroke: var(--landing-accent);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.2;
}

.workflow__step:last-child .workflow__arrow {
  display: none;
}

@media (max-width: 900px) {
  .workflow__steps {
    gap: 0;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .workflow__step {
    padding: 30px;
    border-top: 1px solid var(--landing-border);
  }

  .workflow__step:first-child,
  .workflow__step:nth-child(2) {
    padding-top: 0;
    border-top: 0;
  }

  .workflow__step:first-child,
  .workflow__step:nth-child(3) {
    padding-left: 0;
    border-left: 0;
  }

  .workflow__step:nth-child(2) {
    padding-right: 0;
  }

  .workflow__arrow {
    display: none;
  }
}

@media (max-width: 640px) {
  .workflow__steps {
    margin-top: 54px;
    grid-template-columns: 1fr;
  }

  .workflow__step,
  .workflow__step:first-child,
  .workflow__step:nth-child(2),
  .workflow__step:nth-child(3) {
    padding: 24px 0;
    border-top: 1px solid var(--landing-border);
    border-left: 0;
  }

  .workflow__step:first-child {
    padding-top: 0;
    border-top: 0;
  }

  .workflow__rail {
    height: 38px;
  }

  .workflow__body {
    padding-top: 16px;
  }
}
</style>
