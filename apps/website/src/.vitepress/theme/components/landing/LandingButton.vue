<script setup lang="ts">
import type { LandingLink } from './landingContent'
import { withBase } from 'vitepress'
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  link: LandingLink
  tone?: 'primary' | 'secondary' | 'quiet'
}>(), {
  tone: 'primary',
})

const href = computed(() => props.link.external ? props.link.href : withBase(props.link.href))
</script>

<template>
  <a
    class="landing-button"
    :class="`landing-button--${tone}`"
    :href="href"
    :target="link.external ? '_blank' : undefined"
    :rel="link.external ? 'noreferrer' : undefined"
  >
    <span>{{ link.label }}</span>
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M4 10h11M11 6l4 4-4 4" />
    </svg>
  </a>
</template>

<style scoped>
.landing-button {
  display: inline-flex;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 20px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-family: var(--landing-font-body);
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  text-decoration: none;
  transition: color 180ms ease, background-color 180ms ease, border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease;
}

.landing-button svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentcolor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
  transition: transform 180ms ease;
}

.landing-button:hover {
  text-decoration: none;
  transform: translateY(-2px);
}

.landing-button:hover svg {
  transform: translateX(3px);
}

.landing-button:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--landing-focus) 34%, transparent);
  outline-offset: 3px;
}

.landing-button--primary {
  background: var(--landing-accent);
  box-shadow: 0 10px 28px color-mix(in srgb, var(--landing-accent) 22%, transparent);
  color: var(--landing-on-accent);
}

.landing-button--primary:hover {
  background: var(--landing-accent-hover);
  color: var(--landing-on-accent);
}

.landing-button--secondary {
  border-color: var(--landing-border-strong);
  background: color-mix(in srgb, var(--landing-surface) 78%, transparent);
  color: var(--landing-ink);
}

.landing-button--secondary:hover {
  border-color: var(--landing-accent);
  background: var(--landing-surface);
  color: var(--landing-accent-strong);
}

.landing-button--quiet {
  min-height: 44px;
  padding-inline: 4px;
  color: var(--landing-accent-strong);
}

.landing-button--quiet:hover {
  color: var(--landing-accent);
}

@media (prefers-reduced-motion: reduce) {
  .landing-button,
  .landing-button svg {
    transition: none;
  }

  .landing-button:hover,
  .landing-button:hover svg {
    transform: none;
  }
}
</style>
