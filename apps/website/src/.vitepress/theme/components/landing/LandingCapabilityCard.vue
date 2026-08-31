<script setup lang="ts">
import type { LandingCapabilitiesContent } from './landingContent'
import { withBase } from 'vitepress'

type Capability = LandingCapabilitiesContent['items'][number]

defineProps<{
  item: Capability
  index: number
}>()
</script>

<template>
  <article class="capability-card" :class="[`capability-card--${item.visual}`, `capability-card--${index + 1}`]">
    <div class="capability-card__visual" aria-hidden="true">
      <div v-if="item.visual === 'context'" class="context-visual">
        <div class="context-visual__path">
          <svg viewBox="0 0 24 24"><path d="M3.5 7.5h6l1.8 2H20.5v8.8c0 1-.8 1.7-1.7 1.7H5.2c-1 0-1.7-.8-1.7-1.7V7.5Z" /><path d="M3.5 7.5V5.7c0-1 .8-1.7 1.7-1.7h4.2l2 2.2h6.5" /></svg>
          <span>~/Projects/Lexora</span>
          <i />
        </div>
        <div class="context-visual__files">
          <span><i>MD</i> README.md</span>
          <span><i>TS</i> package.json</span>
          <span><i>VUE</i> LandingPage.vue</span>
        </div>
      </div>

      <div v-else-if="item.visual === 'control'" class="control-visual">
        <div class="control-visual__icon">
          <svg viewBox="0 0 24 24"><path d="M12 3.5 19 6v5.2c0 4.4-2.6 7.7-7 9.3-4.4-1.6-7-4.9-7-9.3V6l7-2.5Z" /><path d="m8.8 12 2 2 4.5-4.6" /></svg>
        </div>
        <div class="control-visual__copy">
          <span>system action</span>
          <strong>restart · lexora.service</strong>
        </div>
        <div class="control-visual__actions">
          <span />
          <span class="is-primary" />
        </div>
      </div>

      <div v-else-if="item.visual === 'automation'" class="automation-visual">
        <div class="automation-visual__clock">
          <span>09</span><i>:</i><span>30</span>
        </div>
        <div class="automation-visual__week">
          <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
        </div>
        <div class="automation-visual__rule">
          <i />
          <span>next run</span>
          <strong>tomorrow</strong>
        </div>
      </div>

      <div v-else-if="item.visual === 'extensible'" class="nodes-visual">
        <div class="nodes-visual__center">
          <img :src="withBase('/logo.png')" width="64" height="64" alt="">
        </div>
        <span class="nodes-visual__node nodes-visual__node--one">MODEL</span>
        <span class="nodes-visual__node nodes-visual__node--two">MCP</span>
        <span class="nodes-visual__node nodes-visual__node--three">SKILL</span>
        <svg viewBox="0 0 320 180">
          <path d="M160 90 75 42M160 90l96-51M160 90l91 60" />
        </svg>
      </div>

      <div v-else class="companion-visual">
        <span class="companion-visual__halo" />
        <img :src="withBase('/logo.png')" width="64" height="64" alt="">
        <div class="companion-visual__status">
          <i />
          <span>task complete</span>
        </div>
        <svg class="companion-visual__spark companion-visual__spark--one" viewBox="0 0 20 20"><path d="M10 1c.7 5.5 3.5 8.3 9 9-5.5.7-8.3 3.5-9 9-.7-5.5-3.5-8.3-9-9 5.5-.7 8.3-3.5 9-9Z" /></svg>
        <svg class="companion-visual__spark companion-visual__spark--two" viewBox="0 0 20 20"><path d="M10 1c.7 5.5 3.5 8.3 9 9-5.5.7-8.3 3.5-9 9-.7-5.5-3.5-8.3-9-9 5.5-.7 8.3-3.5 9-9Z" /></svg>
      </div>
    </div>

    <div class="capability-card__copy">
      <p>{{ item.label }}</p>
      <h3>{{ item.title }}</h3>
      <span>{{ item.description }}</span>
    </div>
  </article>
</template>

<style scoped>
.capability-card {
  position: relative;
  display: flex;
  min-height: 480px;
  overflow: hidden;
  flex-direction: column;
  justify-content: space-between;
  border: 1px solid var(--landing-dark-border);
  border-radius: 18px;
  background: var(--landing-dark-surface);
}

.capability-card--1,
.capability-card--2 {
  grid-column: span 6;
}

.capability-card--3,
.capability-card--4,
.capability-card--5 {
  min-height: 440px;
  grid-column: span 4;
}

.capability-card__visual {
  position: relative;
  min-height: 270px;
  flex: 1;
  overflow: hidden;
}

.capability-card__copy {
  position: relative;
  z-index: 2;
  padding: 28px 30px 32px;
  border-top: 1px solid var(--landing-dark-border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--landing-dark-surface) 88%, transparent), var(--landing-dark-surface) 22%);
}

.capability-card__copy p {
  margin: 0 0 13px;
  color: var(--landing-highlight);
  font-family: var(--landing-font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.15em;
}

.capability-card__copy h3 {
  margin: 0;
  color: var(--landing-dark-ink);
  font-family: var(--landing-font-display);
  font-size: clamp(25px, 2.5vw, 34px);
  font-weight: 600;
  letter-spacing: -0.025em;
  line-height: 1.18;
}

.capability-card__copy > span {
  display: block;
  max-width: 560px;
  margin-top: 13px;
  color: var(--landing-dark-muted);
  font-size: 14px;
  line-height: 1.75;
}

.context-visual {
  position: absolute;
  inset: 42px 42px auto;
  overflow: hidden;
  border: 1px solid var(--landing-dark-border);
  border-radius: 13px;
  background: color-mix(in srgb, var(--landing-dark-raised) 92%, transparent);
  box-shadow: 0 28px 60px rgb(0 0 0 / 22%);
}

.context-visual__path {
  display: flex;
  min-height: 58px;
  align-items: center;
  gap: 10px;
  padding: 0 18px;
  border-bottom: 1px solid var(--landing-dark-border);
  color: var(--landing-dark-ink);
  font-family: var(--landing-font-mono);
  font-size: 11px;
}

.context-visual__path svg {
  width: 19px;
  fill: none;
  stroke: var(--landing-highlight);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.4;
}

.context-visual__path i {
  width: 7px;
  height: 7px;
  margin-left: auto;
  border-radius: 50%;
  background: var(--landing-success);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--landing-success) 12%, transparent);
}

.context-visual__files {
  display: grid;
  gap: 1px;
  padding: 12px;
}

.context-visual__files span {
  display: flex;
  min-height: 42px;
  align-items: center;
  gap: 12px;
  padding: 0 10px;
  border-radius: 7px;
  color: var(--landing-dark-muted);
  font-family: var(--landing-font-mono);
  font-size: 10px;
}

.context-visual__files span:nth-child(2) {
  background: color-mix(in srgb, var(--landing-highlight) 7%, transparent);
  color: var(--landing-dark-ink);
}

.context-visual__files i {
  display: grid;
  width: 29px;
  height: 24px;
  place-items: center;
  border: 1px solid var(--landing-dark-border);
  border-radius: 5px;
  color: var(--landing-highlight);
  font-size: 7px;
  font-style: normal;
}

.control-visual {
  position: absolute;
  inset: 52px 44px auto;
  display: grid;
  align-items: center;
  grid-template-columns: auto 1fr auto;
  gap: 14px;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--landing-highlight) 18%, var(--landing-dark-border));
  border-radius: 14px;
  background: var(--landing-dark-raised);
  box-shadow: 0 28px 60px rgb(0 0 0 / 24%);
}

.control-visual__icon {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border-radius: 12px;
  background: color-mix(in srgb, var(--landing-highlight) 9%, transparent);
}

.control-visual__icon svg {
  width: 25px;
  fill: none;
  stroke: var(--landing-highlight);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
}

.control-visual__copy {
  display: grid;
  min-width: 0;
  gap: 4px;
  font-family: var(--landing-font-mono);
}

.control-visual__copy span {
  color: var(--landing-dark-muted);
  font-size: 8px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.control-visual__copy strong {
  overflow: hidden;
  color: var(--landing-dark-ink);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-visual__actions {
  display: flex;
  gap: 7px;
}

.control-visual__actions span {
  width: 34px;
  height: 28px;
  border: 1px solid var(--landing-dark-border);
  border-radius: 999px;
}

.control-visual__actions .is-primary {
  border-color: var(--landing-highlight);
  background: var(--landing-highlight);
}

.automation-visual {
  position: absolute;
  inset: 34px 28px auto;
  padding: 22px;
  border: 1px solid var(--landing-dark-border);
  border-radius: 14px;
  background: var(--landing-dark-raised);
  box-shadow: 0 26px 56px rgb(0 0 0 / 24%);
}

.automation-visual__clock {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--landing-dark-ink);
  font-family: var(--landing-font-mono);
  font-size: 36px;
  font-weight: 600;
  letter-spacing: -0.08em;
}

.automation-visual__clock span {
  display: grid;
  width: 68px;
  height: 58px;
  place-items: center;
  border: 1px solid var(--landing-dark-border);
  border-radius: 9px;
  background: color-mix(in srgb, var(--landing-dark-surface) 74%, transparent);
}

.automation-visual__clock i {
  margin: 0 8px;
  color: var(--landing-highlight);
  font-style: normal;
}

.automation-visual__week {
  display: grid;
  gap: 5px;
  margin-top: 18px;
  grid-template-columns: repeat(7, 1fr);
}

.automation-visual__week span {
  display: grid;
  aspect-ratio: 1;
  place-items: center;
  border-radius: 50%;
  color: var(--landing-dark-muted);
  font-family: var(--landing-font-mono);
  font-size: 8px;
}

.automation-visual__week span:nth-child(-n + 5) {
  background: color-mix(in srgb, var(--landing-highlight) 10%, transparent);
  color: var(--landing-highlight);
}

.automation-visual__rule {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--landing-dark-border);
  color: var(--landing-dark-muted);
  font-family: var(--landing-font-mono);
  font-size: 8px;
}

.automation-visual__rule i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--landing-success);
}

.automation-visual__rule strong {
  margin-left: auto;
  color: var(--landing-dark-ink);
  font-size: 8px;
}

.nodes-visual {
  position: absolute;
  inset: 18px 12px auto;
  height: 238px;
}

.nodes-visual > svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  fill: none;
  stroke: color-mix(in srgb, var(--landing-highlight) 38%, transparent);
  stroke-dasharray: 4 7;
  stroke-width: 1;
}

.nodes-visual__center,
.nodes-visual__node {
  position: absolute;
  z-index: 1;
  display: grid;
  place-items: center;
  border: 1px solid var(--landing-dark-border);
  background: var(--landing-dark-raised);
  box-shadow: 0 15px 35px rgb(0 0 0 / 20%);
}

.nodes-visual__center {
  top: 70px;
  left: 50%;
  width: 72px;
  height: 72px;
  border-color: color-mix(in srgb, var(--landing-highlight) 28%, var(--landing-dark-border));
  border-radius: 21px;
  transform: translateX(-50%);
}

.nodes-visual__center img {
  width: 46px;
  height: 46px;
}

.nodes-visual__node {
  min-width: 68px;
  min-height: 32px;
  padding: 0 9px;
  border-radius: 999px;
  color: var(--landing-dark-muted);
  font-family: var(--landing-font-mono);
  font-size: 8px;
  letter-spacing: 0.1em;
}

.nodes-visual__node--one {
  top: 19px;
  left: 24px;
}

.nodes-visual__node--two {
  top: 14px;
  right: 16px;
}

.nodes-visual__node--three {
  right: 22px;
  bottom: 16px;
  color: var(--landing-highlight);
}

.companion-visual {
  position: absolute;
  inset: 18px 16px auto;
  display: grid;
  height: 240px;
  place-items: center;
}

.companion-visual__halo {
  position: absolute;
  width: 190px;
  height: 190px;
  border: 1px solid color-mix(in srgb, var(--landing-highlight) 18%, transparent);
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--landing-highlight) 13%, transparent), transparent 66%);
  box-shadow: 0 0 0 34px color-mix(in srgb, var(--landing-highlight) 3%, transparent);
}

.companion-visual > img {
  position: relative;
  width: 102px;
  height: 102px;
  filter: drop-shadow(0 20px 20px rgb(0 0 0 / 24%));
}

.companion-visual__status {
  position: absolute;
  right: 10px;
  bottom: 24px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 11px;
  border: 1px solid var(--landing-dark-border);
  border-radius: 999px;
  background: var(--landing-dark-raised);
  color: var(--landing-dark-ink);
  font-family: var(--landing-font-mono);
  font-size: 8px;
  letter-spacing: 0.04em;
}

.companion-visual__status i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--landing-success);
}

.companion-visual__spark {
  position: absolute;
  width: 18px;
  fill: var(--landing-highlight);
}

.companion-visual__spark--one {
  top: 38px;
  right: 52px;
}

.companion-visual__spark--two {
  bottom: 54px;
  left: 34px;
  width: 11px;
  opacity: 0.55;
}

@media (max-width: 900px) {
  .capability-card--1,
  .capability-card--2,
  .capability-card--3,
  .capability-card--4 {
    grid-column: span 6;
  }

  .capability-card--5 {
    min-height: 420px;
    grid-column: span 12;
  }
}

@media (max-width: 640px) {
  .capability-card,
  .capability-card--1,
  .capability-card--2,
  .capability-card--3,
  .capability-card--4,
  .capability-card--5 {
    min-height: 430px;
    grid-column: span 12;
  }

  .capability-card__copy {
    padding: 24px;
  }

  .context-visual {
    inset: 34px 24px auto;
  }

  .control-visual {
    inset: 42px 20px auto;
    grid-template-columns: auto 1fr;
  }

  .control-visual__actions {
    display: none;
  }
}
</style>
