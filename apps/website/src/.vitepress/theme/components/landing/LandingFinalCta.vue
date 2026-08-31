<script setup lang="ts">
import type { LandingFinalContent } from './landingContent'
import { withBase } from 'vitepress'
import LandingButton from './LandingButton.vue'

defineProps<{
  content: LandingFinalContent
}>()
</script>

<template>
  <section class="final-cta">
    <div class="final-cta__rings" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
    <div class="landing-container final-cta__inner">
      <div class="final-cta__mark" aria-hidden="true">
        <img :src="withBase('/logo.png')" width="64" height="64" alt="">
      </div>
      <p class="final-cta__eyebrow">
        {{ content.eyebrow }}
      </p>
      <h2>{{ content.title }}</h2>
      <p class="final-cta__description">
        {{ content.description }}
      </p>

      <a
        class="download-card"
        :href="content.primaryAction.href"
        target="_blank"
        rel="noreferrer"
      >
        <span class="download-card__icon" aria-hidden="true">
          <svg viewBox="0 0 28 28">
            <rect x="3.5" y="4.5" width="21" height="15" rx="2.5" />
            <path d="M10 24h8M14 19.5V24" />
          </svg>
        </span>
        <span class="download-card__copy">
          <small>{{ content.primaryMeta }}</small>
          <strong>{{ content.primaryAction.label }}</strong>
        </span>
        <svg class="download-card__arrow" aria-hidden="true" viewBox="0 0 24 24">
          <path d="M5 12h13M13 7l5 5-5 5" />
        </svg>
      </a>

      <div class="final-cta__platforms">
        <p>{{ content.platformLabel }}</p>
        <ul>
          <li v-for="platform in content.platforms" :key="platform">
            <i />
            {{ platform }}
          </li>
        </ul>
      </div>

      <div class="final-cta__secondary">
        <LandingButton :link="content.secondaryAction" tone="quiet" />
      </div>

      <p class="final-cta__footnote">
        {{ content.footnote }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.final-cta {
  position: relative;
  overflow: hidden;
  padding: clamp(106px, 13vw, 180px) 0 110px;
  background: var(--landing-canvas);
  text-align: center;
}

.final-cta::before {
  position: absolute;
  inset: 0;
  opacity: 0.38;
  background-image:
    linear-gradient(color-mix(in srgb, var(--landing-ink) 3.5%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--landing-ink) 3.5%, transparent) 1px, transparent 1px);
  background-size: 48px 48px;
  content: '';
  mask-image: radial-gradient(circle at center, black, transparent 72%);
  pointer-events: none;
}

.final-cta__rings {
  position: absolute;
  top: 52%;
  left: 50%;
  display: grid;
  width: min(900px, 94vw);
  aspect-ratio: 1;
  place-items: center;
  transform: translate(-50%, -48%);
}

.final-cta__rings span {
  position: absolute;
  border: 1px solid color-mix(in srgb, var(--landing-accent) 12%, transparent);
  border-radius: 50%;
}

.final-cta__rings span:first-child {
  width: 34%;
  height: 34%;
  background: radial-gradient(circle, color-mix(in srgb, var(--landing-highlight) 13%, transparent), transparent 68%);
}

.final-cta__rings span:nth-child(2) {
  width: 65%;
  height: 65%;
}

.final-cta__rings span:last-child {
  width: 100%;
  height: 100%;
}

.final-cta__inner {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  flex-direction: column;
}

.final-cta__mark {
  display: grid;
  width: 72px;
  height: 72px;
  margin-bottom: 24px;
  place-items: center;
  border: 1px solid var(--landing-border-strong);
  border-radius: 20px;
  background: var(--landing-surface);
  box-shadow: 0 18px 44px color-mix(in srgb, var(--landing-shadow) 13%, transparent);
  transform: rotate(-3deg);
}

.final-cta__mark img {
  width: 52px;
  height: 52px;
}

.final-cta__eyebrow {
  margin: 0;
  color: var(--landing-accent-strong);
  font-family: var(--landing-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.15em;
}

.final-cta h2 {
  max-width: 840px;
  margin: 22px 0 0;
  color: var(--landing-ink);
  font-family: var(--landing-font-display);
  font-size: clamp(44px, 6vw, 72px);
  font-weight: 500;
  letter-spacing: -0.05em;
  line-height: 1.02;
  white-space: pre-line;
}

.final-cta__description {
  max-width: 650px;
  margin: 26px 0 0;
  color: var(--landing-muted);
  font-size: 17px;
  line-height: 1.75;
}

.download-card {
  display: grid;
  width: min(100%, 440px);
  min-height: 82px;
  align-items: center;
  grid-template-columns: auto 1fr auto;
  gap: 16px;
  margin-top: 38px;
  padding: 12px 16px 12px 13px;
  border: 1px solid color-mix(in srgb, var(--landing-accent-strong) 70%, transparent);
  border-radius: 20px;
  background: var(--landing-accent);
  box-shadow:
    0 18px 45px color-mix(in srgb, var(--landing-accent) 24%, transparent),
    0 1px 0 color-mix(in srgb, white 24%, transparent) inset;
  color: var(--landing-on-accent);
  text-align: left;
  text-decoration: none;
  transition: background-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
}

.download-card:hover {
  background: var(--landing-accent-hover);
  box-shadow:
    0 22px 52px color-mix(in srgb, var(--landing-accent) 30%, transparent),
    0 1px 0 color-mix(in srgb, white 24%, transparent) inset;
  color: var(--landing-on-accent);
  text-decoration: none;
  transform: translateY(-3px);
}

.download-card:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--landing-focus) 34%, transparent);
  outline-offset: 4px;
}

.download-card__icon {
  display: grid;
  width: 54px;
  height: 54px;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--landing-on-accent) 22%, transparent);
  border-radius: 15px;
  background: color-mix(in srgb, var(--landing-on-accent) 10%, transparent);
}

.download-card__icon svg {
  width: 27px;
  fill: none;
  stroke: currentcolor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.6;
}

.download-card__copy {
  display: grid;
  gap: 5px;
}

.download-card__copy small {
  color: color-mix(in srgb, var(--landing-on-accent) 72%, transparent);
  font-family: var(--landing-font-mono);
  font-size: 8px;
  letter-spacing: 0.08em;
  line-height: 1.3;
  text-transform: uppercase;
}

.download-card__copy strong {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.3;
}

.download-card__arrow {
  width: 25px;
  fill: none;
  stroke: currentcolor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.6;
  transition: transform 180ms ease;
}

.download-card:hover .download-card__arrow {
  transform: translateX(4px);
}

.final-cta__platforms {
  display: grid;
  gap: 12px;
  margin-top: 24px;
}

.final-cta__platforms p {
  margin: 0;
  color: var(--landing-muted);
  font-size: 13px;
}

.final-cta__platforms ul {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.final-cta__platforms li {
  display: flex;
  min-height: 30px;
  align-items: center;
  gap: 7px;
  padding: 0 11px;
  border: 1px solid var(--landing-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--landing-surface) 78%, transparent);
  color: var(--landing-faint);
  font-family: var(--landing-font-mono);
  font-size: 9px;
}

.final-cta__platforms i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--landing-success);
}

.final-cta__secondary {
  margin-top: 14px;
}

.final-cta__footnote {
  margin: 20px 0 0;
  color: var(--landing-faint);
  font-family: var(--landing-font-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
}

@media (max-width: 640px) {
  .final-cta__description {
    font-size: 16px;
  }

  .download-card {
    min-height: 78px;
    gap: 12px;
    padding-right: 14px;
  }

  .download-card__icon {
    width: 50px;
    height: 50px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .download-card,
  .download-card__arrow {
    transition: none;
  }

  .download-card:hover,
  .download-card:hover .download-card__arrow {
    transform: none;
  }
}
</style>
