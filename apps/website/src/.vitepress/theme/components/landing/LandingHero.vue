<script setup lang="ts">
import type { LandingHeroContent } from './landingContent'
import { withBase } from 'vitepress'
import { computed } from 'vue'
import LandingButton from './LandingButton.vue'

const props = defineProps<{
  content: LandingHeroContent
}>()

const previewSteps = computed(() => props.content.preview.steps.map((label, index, steps) => ({
  isActive: index === steps.length - 1,
  isCompleted: index < steps.length - 1,
  label,
})))
</script>

<template>
  <section class="hero">
    <div class="hero__texture" aria-hidden="true" />
    <div class="landing-container hero__inner">
      <div class="hero__copy">
        <p class="hero__eyebrow">
          <span class="hero__eyebrow-mark" />
          {{ content.eyebrow }}
        </p>
        <h1 class="hero__title">
          {{ content.title }}
        </h1>
        <p class="hero__description">
          {{ content.description }}
        </p>
        <div class="hero__actions">
          <LandingButton :link="content.primaryAction" />
          <LandingButton :link="content.secondaryAction" tone="secondary" />
        </div>
        <p class="hero__note">
          {{ content.note }}
        </p>
      </div>

      <div class="hero__stage">
        <svg class="hero__orbit" aria-hidden="true" viewBox="0 0 800 620">
          <path d="M78 311c25-168 163-273 337-257 174 15 305 151 306 312 2 161-127 229-303 210C241 557 54 479 78 311Z" />
          <path d="M158 201c97-105 306-126 433-40 126 86 124 249 5 328" />
        </svg>

        <div class="product-window">
          <div class="product-window__bar">
            <div class="product-window__dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <span class="product-window__title">{{ content.preview.windowTitle }}</span>
            <span class="product-window__status">
              <i />
              {{ content.preview.status }}
            </span>
          </div>
          <img
            class="product-window__image"
            :src="withBase('/landing/desktop.webp')"
            width="1800"
            height="971"
            :alt="`${content.preview.windowTitle}: ${content.preview.task}`"
            fetchpriority="high"
          >
        </div>

        <div class="task-card">
          <div class="task-card__topline">
            <span>{{ content.preview.taskLabel }}</span>
            <span class="task-card__pulse" aria-hidden="true" />
          </div>
          <strong>{{ content.preview.task }}</strong>
          <ol>
            <li v-for="step in previewSteps" :key="step.label" :class="{ 'is-active': step.isActive }">
              <span class="task-card__check" aria-hidden="true">
                <svg v-if="step.isCompleted" viewBox="0 0 12 12">
                  <path d="m3 6.2 1.8 1.7L9 3.8" />
                </svg>
              </span>
              {{ step.label }}
            </li>
          </ol>
        </div>

        <div class="scope-card">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M4 7.5h6l1.7 2H20v8.8c0 .9-.8 1.7-1.7 1.7H5.7c-.9 0-1.7-.8-1.7-1.7V7.5Z" />
            <path d="M4 7.5V5.7C4 4.8 4.8 4 5.7 4h4.1l2 2.2H18" />
          </svg>
          <span>
            <small>{{ content.preview.scopeLabel }}</small>
            <strong>{{ content.preview.scope }}</strong>
          </span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  overflow: hidden;
  padding: clamp(84px, 9vw, 138px) 0 94px;
  background:
    radial-gradient(circle at 76% 18%, color-mix(in srgb, var(--landing-accent) 16%, transparent), transparent 34%),
    radial-gradient(circle at 96% 4%, color-mix(in srgb, var(--landing-highlight) 11%, transparent), transparent 26%),
    linear-gradient(180deg, var(--landing-canvas) 0%, var(--landing-canvas-soft) 100%);
}

.hero__texture {
  position: absolute;
  inset: 0;
  opacity: 0.48;
  background-image:
    linear-gradient(color-mix(in srgb, var(--landing-ink) 4%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--landing-ink) 4%, transparent) 1px, transparent 1px);
  background-position: center;
  background-size: 48px 48px;
  mask-image: linear-gradient(to bottom, black, transparent 82%);
  pointer-events: none;
}

.hero__inner {
  position: relative;
  display: grid;
  align-items: center;
  grid-template-columns: minmax(0, 0.9fr) minmax(520px, 1.1fr);
  gap: clamp(44px, 6vw, 96px);
}

.hero__copy {
  position: relative;
  z-index: 3;
  padding-bottom: 8px;
  animation: hero-copy-enter 720ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.hero__eyebrow {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 24px;
  color: var(--landing-accent-strong);
  font-family: var(--landing-font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.hero__eyebrow-mark {
  width: 9px;
  height: 9px;
  border: 2px solid var(--landing-accent);
  border-radius: 50% 50% 50% 2px;
  transform: rotate(-45deg);
}

.hero__title {
  max-width: 780px;
  margin: 0;
  color: var(--landing-ink);
  font-family: var(--landing-font-display);
  font-size: clamp(52px, 6.2vw, 90px);
  font-weight: 500;
  letter-spacing: -0.055em;
  line-height: 0.98;
  white-space: pre-line;
}

.hero__description {
  max-width: 620px;
  margin: 30px 0 0;
  color: var(--landing-muted);
  font-size: clamp(17px, 1.75vw, 20px);
  line-height: 1.75;
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 34px;
}

.hero__note {
  margin: 20px 0 0;
  color: var(--landing-faint);
  font-family: var(--landing-font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
}

.hero__stage {
  position: relative;
  min-width: 720px;
  padding: 72px 0 78px;
  animation: hero-stage-enter 900ms 100ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.hero__orbit {
  position: absolute;
  z-index: 0;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  fill: none;
  opacity: 0.6;
  stroke: color-mix(in srgb, var(--landing-accent) 38%, transparent);
  stroke-dasharray: 4 10;
  stroke-linecap: round;
  stroke-width: 1.2;
}

.product-window {
  position: relative;
  z-index: 1;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--landing-border-strong) 85%, transparent);
  border-radius: 16px;
  background: var(--landing-surface);
  box-shadow:
    0 1px 0 color-mix(in srgb, white 72%, transparent) inset,
    0 28px 80px color-mix(in srgb, var(--landing-shadow) 18%, transparent);
  transform: perspective(1400px) rotateY(-4deg) rotateX(1.5deg);
  transform-origin: left center;
}

.product-window__bar {
  display: grid;
  min-height: 42px;
  align-items: center;
  grid-template-columns: 1fr auto 1fr;
  border-bottom: 1px solid var(--landing-border);
  background: color-mix(in srgb, var(--landing-surface) 92%, var(--landing-canvas));
  color: var(--landing-faint);
  font-family: var(--landing-font-mono);
  font-size: 10px;
}

.product-window__dots {
  display: flex;
  gap: 6px;
  padding-left: 16px;
}

.product-window__dots span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--landing-border-strong);
}

.product-window__dots span:first-child {
  background: #d78873;
}

.product-window__dots span:nth-child(2) {
  background: #d3ad5f;
}

.product-window__dots span:last-child {
  background: #79ae89;
}

.product-window__title {
  color: var(--landing-muted);
  font-weight: 700;
  letter-spacing: 0.04em;
}

.product-window__status {
  display: flex;
  align-items: center;
  justify-self: end;
  gap: 7px;
  padding-right: 16px;
}

.product-window__status i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--landing-success);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--landing-success) 14%, transparent);
}

.product-window__image {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 1.853;
  object-fit: cover;
  object-position: top left;
}

.task-card,
.scope-card {
  position: absolute;
  z-index: 2;
  border: 1px solid color-mix(in srgb, var(--landing-border-strong) 86%, transparent);
  background: color-mix(in srgb, var(--landing-surface) 94%, transparent);
  box-shadow: 0 18px 48px color-mix(in srgb, var(--landing-shadow) 16%, transparent);
  backdrop-filter: blur(18px);
}

.task-card {
  right: -22px;
  bottom: 14px;
  width: min(330px, 46%);
  padding: 18px;
  border-radius: 13px;
}

.task-card__topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  color: var(--landing-faint);
  font-family: var(--landing-font-mono);
  font-size: 9px;
  letter-spacing: 0.12em;
}

.task-card__pulse {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--landing-accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--landing-accent) 13%, transparent);
}

.task-card strong {
  display: block;
  color: var(--landing-ink);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.55;
}

.task-card ol {
  display: grid;
  gap: 8px;
  margin: 14px 0 0;
  padding: 13px 0 0;
  border-top: 1px solid var(--landing-border);
  list-style: none;
}

.task-card li {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--landing-muted);
  font-size: 10px;
  line-height: 1.4;
}

.task-card__check {
  display: grid;
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--landing-success) 42%, var(--landing-border));
  border-radius: 50%;
  background: color-mix(in srgb, var(--landing-success) 10%, transparent);
}

.task-card__check svg {
  width: 10px;
  fill: none;
  stroke: var(--landing-success);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.6;
}

.task-card li.is-active .task-card__check {
  border-color: var(--landing-accent);
  background: var(--landing-accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--landing-accent) 12%, transparent);
}

.scope-card {
  bottom: 54px;
  left: -38px;
  display: flex;
  min-width: 230px;
  align-items: center;
  gap: 11px;
  padding: 13px 15px;
  border-radius: 12px;
}

.scope-card > svg {
  width: 22px;
  flex: 0 0 auto;
  fill: none;
  stroke: var(--landing-accent);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
}

.scope-card span {
  display: grid;
  gap: 2px;
}

.scope-card small {
  color: var(--landing-faint);
  font-family: var(--landing-font-mono);
  font-size: 8px;
  letter-spacing: 0.09em;
}

.scope-card strong {
  color: var(--landing-ink);
  font-family: var(--landing-font-mono);
  font-size: 10px;
  font-weight: 600;
}

@keyframes hero-copy-enter {
  from {
    opacity: 0;
    transform: translateY(22px);
  }
}

@keyframes hero-stage-enter {
  from {
    opacity: 0;
    transform: translateY(28px) scale(0.98);
  }
}

@media (max-width: 1180px) {
  .hero__inner {
    grid-template-columns: minmax(0, 0.88fr) minmax(480px, 1.12fr);
    gap: 36px;
  }

  .hero__stage {
    min-width: 600px;
  }

  .task-card {
    right: 0;
  }

  .scope-card {
    left: -16px;
  }
}

@media (max-width: 960px) {
  .hero {
    padding-top: 86px;
  }

  .hero__inner {
    grid-template-columns: 1fr;
  }

  .hero__copy {
    max-width: 760px;
  }

  .hero__stage {
    min-width: 0;
    padding: 56px 28px 88px;
  }

  .product-window {
    transform: none;
  }

  .scope-card {
    left: 0;
  }

  .task-card {
    right: 0;
  }
}

@media (max-width: 640px) {
  .hero {
    padding: 62px 0 70px;
  }

  .hero__title {
    font-size: clamp(46px, 14vw, 64px);
    line-height: 1.02;
  }

  .hero__description {
    margin-top: 22px;
    font-size: 16px;
  }

  .hero__actions {
    display: grid;
    margin-top: 28px;
  }

  .hero__stage {
    padding: 36px 0 142px;
  }

  .product-window {
    border-radius: 11px;
  }

  .product-window__bar {
    min-height: 34px;
    grid-template-columns: 1fr auto;
  }

  .product-window__title {
    display: none;
  }

  .product-window__status {
    font-size: 8px;
  }

  .scope-card {
    bottom: 68px;
    min-width: 206px;
  }

  .task-card {
    right: -8px;
    bottom: 0;
    width: min(276px, 82%);
    padding: 14px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero__copy,
  .hero__stage {
    animation: none;
  }
}
</style>
