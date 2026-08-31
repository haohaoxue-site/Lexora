<script setup lang="ts">
import type { LandingDocumentContent } from './landingContent'
import { withBase } from 'vitepress'
import { computed } from 'vue'
import LandingButton from './LandingButton.vue'
import LandingSectionHeading from './LandingSectionHeading.vue'

const props = defineProps<{
  content: LandingDocumentContent
}>()

const numberedPoints = computed(() => props.content.points.map((point, index) => ({
  number: String(index + 1).padStart(2, '0'),
  point,
})))
</script>

<template>
  <section id="web-workspace" class="document-bridge">
    <div class="landing-container document-bridge__inner">
      <div class="document-bridge__copy">
        <LandingSectionHeading
          :kicker="content.kicker"
          :title="content.title"
          :description="content.description"
        />

        <ol class="document-bridge__points">
          <li v-for="item in numberedPoints" :key="item.point.title">
            <span>{{ item.number }}</span>
            <div>
              <h3>{{ item.point.title }}</h3>
              <p>{{ item.point.description }}</p>
            </div>
          </li>
        </ol>

        <div class="document-bridge__actions">
          <LandingButton :link="content.primaryAction" />
          <LandingButton :link="content.secondaryAction" tone="quiet" />
        </div>
      </div>

      <div class="document-bridge__stage">
        <div class="document-bridge__label">
          <i />
          {{ content.previewLabel }}
        </div>
        <div class="document-window">
          <div class="document-window__bar" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <img
            :src="withBase('/landing/web.webp')"
            width="1600"
            height="854"
            :alt="content.previewAlt"
            loading="lazy"
          >
        </div>
        <div class="document-bridge__annotation" aria-hidden="true">
          <svg viewBox="0 0 84 58">
            <path d="M81 4C54 7 30 20 9 47" />
            <path d="m9 47 2-13M9 47l14-2" />
          </svg>
          <span>write · version · publish</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.document-bridge {
  position: relative;
  overflow: hidden;
  padding: clamp(100px, 12vw, 170px) 0;
  background: var(--landing-canvas-soft);
}

.document-bridge::before {
  position: absolute;
  inset: 0;
  opacity: 0.45;
  background-image: radial-gradient(color-mix(in srgb, var(--landing-accent) 15%, transparent) 0.8px, transparent 0.8px);
  background-size: 22px 22px;
  content: '';
  mask-image: linear-gradient(90deg, transparent 25%, black 100%);
  pointer-events: none;
}

.document-bridge__inner {
  position: relative;
  display: grid;
  align-items: center;
  grid-template-columns: minmax(0, 0.75fr) minmax(560px, 1.25fr);
  gap: clamp(52px, 8vw, 110px);
}

.document-bridge__points {
  display: grid;
  gap: 0;
  margin: 48px 0 0;
  padding: 0;
  border-top: 1px solid var(--landing-border-strong);
  list-style: none;
}

.document-bridge__points li {
  display: grid;
  grid-template-columns: 42px 1fr;
  gap: 16px;
  padding: 20px 0;
  border-bottom: 1px solid var(--landing-border);
}

.document-bridge__points > li > span {
  padding-top: 4px;
  color: var(--landing-accent-strong);
  font-family: var(--landing-font-mono);
  font-size: 10px;
  font-weight: 700;
}

.document-bridge__points h3 {
  margin: 0;
  color: var(--landing-ink);
  font-family: var(--landing-font-display);
  font-size: 21px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.25;
}

.document-bridge__points p {
  margin: 7px 0 0;
  color: var(--landing-muted);
  font-size: 13px;
  line-height: 1.7;
}

.document-bridge__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 18px;
  margin-top: 30px;
}

.document-bridge__stage {
  position: relative;
  min-width: 740px;
  padding: 62px 0 74px;
}

.document-bridge__label {
  position: absolute;
  top: 26px;
  left: 24px;
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--landing-accent-strong);
  font-family: var(--landing-font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.13em;
}

.document-bridge__label i {
  width: 18px;
  height: 1px;
  background: var(--landing-accent);
}

.document-window {
  overflow: hidden;
  border: 1px solid var(--landing-border-strong);
  border-radius: 15px;
  background: var(--landing-surface);
  box-shadow:
    24px 30px 0 color-mix(in srgb, var(--landing-accent) 8%, transparent),
    0 30px 80px color-mix(in srgb, var(--landing-shadow) 13%, transparent);
  transform: rotate(1.4deg);
}

.document-window__bar {
  display: flex;
  min-height: 40px;
  align-items: center;
  gap: 6px;
  padding: 0 15px;
  border-bottom: 1px solid var(--landing-border);
  background: color-mix(in srgb, var(--landing-surface) 90%, var(--landing-canvas));
}

.document-window__bar span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--landing-border-strong);
}

.document-window img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 1.873;
  object-fit: cover;
  object-position: top left;
}

.document-bridge__annotation {
  position: absolute;
  right: -14px;
  bottom: 6px;
  display: flex;
  align-items: flex-end;
  gap: 6px;
  color: var(--landing-accent-strong);
  font-family: var(--landing-font-display);
  font-size: 14px;
  font-style: italic;
}

.document-bridge__annotation svg {
  width: 74px;
  fill: none;
  stroke: currentcolor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.2;
}

@media (max-width: 1100px) {
  .document-bridge__inner {
    grid-template-columns: minmax(0, 0.85fr) minmax(500px, 1.15fr);
    gap: 48px;
  }

  .document-bridge__stage {
    min-width: 650px;
  }
}

@media (max-width: 900px) {
  .document-bridge__inner {
    grid-template-columns: 1fr;
  }

  .document-bridge__copy {
    max-width: 700px;
  }

  .document-bridge__stage {
    min-width: 0;
  }
}

@media (max-width: 640px) {
  .document-bridge__actions {
    align-items: stretch;
    flex-direction: column;
  }

  .document-bridge__stage {
    padding: 48px 0 62px;
  }

  .document-window {
    border-radius: 10px;
    box-shadow:
      12px 16px 0 color-mix(in srgb, var(--landing-accent) 8%, transparent),
      0 24px 60px color-mix(in srgb, var(--landing-shadow) 13%, transparent);
    transform: rotate(0.7deg);
  }

  .document-bridge__annotation {
    right: 0;
    bottom: 2px;
  }
}
</style>
