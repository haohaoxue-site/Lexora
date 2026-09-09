<script setup lang="ts">
import appIcon from '../../../resources/icons/app-icon.png'

defineProps<{ still: boolean }>()
const stars = [
  { x: '14%', y: '30%', delay: '-0.4s' },
  { x: '79%', y: '17%', delay: '-1.6s' },
  { x: '90%', y: '60%', delay: '-0.9s' },
  { x: '27%', y: '83%', delay: '-2.5s' },
  { x: '59%', y: '8%', delay: '-1.1s' },
  { x: '74%', y: '84%', delay: '-3s' },
]
</script>

<template>
  <div class="startup-art" :class="{ 'is-still': still }" aria-hidden="true">
    <div class="startup-art__atmosphere" />
    <svg class="startup-art__chart" viewBox="0 0 400 400" fill="none">
      <circle cx="200" cy="200" r="169" stroke="currentColor" stroke-dasharray="1 15" />
      <circle cx="200" cy="200" r="151" stroke="currentColor" stroke-dasharray="26 220 80 360" />
      <path d="M200 23v11m0 332v11M23 200h11m332 0h11M77 77l8 8m230 230 8 8M77 323l8-8M315 85l8-8" stroke="currentColor" />
      <path d="m65 123 41-35 46 12M304 78l20 70 37 39M65 284l43 37 58-11" stroke="currentColor" opacity=".45" />
      <g fill="currentColor"><circle cx="106" cy="88" r="2" /><circle cx="324" cy="148" r="2" /><circle cx="108" cy="321" r="2" /></g>
    </svg>
    <div class="startup-art__orbit startup-art__orbit--one">
      <div class="startup-art__track">
        <i /><b />
      </div>
    </div>
    <div class="startup-art__orbit startup-art__orbit--two">
      <div class="startup-art__track">
        <i /><b />
      </div>
    </div>
    <div class="startup-art__orbit startup-art__orbit--three">
      <div class="startup-art__track">
        <i />
      </div>
    </div>
    <div class="startup-art__halo" />
    <div class="startup-art__core">
      <img :src="appIcon" alt="" width="76" height="76">
    </div>
    <i v-for="(star, index) in stars" :key="index" class="startup-art__star" :style="{ left: star.x, top: star.y, animationDelay: star.delay }" />
  </div>
</template>

<style scoped>
.startup-art { position: relative; width: min(22rem, 48vmin); aspect-ratio: 1; isolation: isolate; }
.startup-art__atmosphere { position: absolute; z-index: -1; inset: -25%; border-radius: 50%; background: radial-gradient(ellipse at 40% 42%, color-mix(in srgb, var(--buddy-accent-surface) 80%, transparent), transparent 48%), radial-gradient(ellipse at 64% 61%, color-mix(in srgb, var(--buddy-status-warning-surface) 70%, transparent), transparent 47%); animation: startup-breathe 5s ease-in-out infinite; }
.startup-art__chart { position: absolute; inset: 0; width: 100%; height: 100%; color: var(--buddy-accent-text); opacity: 0.23; animation: startup-chart-reveal 900ms ease-out both; }
.startup-art__orbit { position: absolute; inset: 9%; transform: rotate(-28deg) scaleY(0.47); }
.startup-art__track { position: absolute; inset: 0; border: 1px solid color-mix(in srgb, var(--buddy-accent-text) 30%, transparent); border-radius: 50%; animation: startup-revolve 9s linear infinite; }
.startup-art__track::before { position: absolute; inset: -1px; border: 1px solid transparent; border-top-color: var(--buddy-accent-text); border-radius: inherit; opacity: 0.65; content: ''; }
.startup-art__track i, .startup-art__track b { position: absolute; left: 50%; top: -3px; width: 6px; height: 6px; border-radius: 50%; background: var(--buddy-accent-text); box-shadow: 0 0 12px color-mix(in srgb, var(--buddy-accent-text) 60%, transparent); }
.startup-art__track b { top: auto; bottom: -2px; width: 4px; height: 4px; opacity: 0.5; }
.startup-art__orbit--two { inset: 14%; transform: rotate(52deg) scaleY(0.65); }
.startup-art__orbit--two .startup-art__track { border-color: color-mix(in srgb, var(--buddy-status-warning-text) 28%, transparent); animation-duration: 13s; animation-direction: reverse; }
.startup-art__orbit--two .startup-art__track::before { border-top-color: var(--buddy-status-warning-text); }
.startup-art__orbit--two .startup-art__track i, .startup-art__orbit--two .startup-art__track b { background: var(--buddy-status-warning-text); }
.startup-art__orbit--three { inset: 27%; transform: rotate(-8deg) scaleY(0.9); }
.startup-art__orbit--three .startup-art__track { border-style: dashed; border-color: var(--buddy-border-subtle); animation-duration: 18s; }
.startup-art__orbit--three .startup-art__track::before { opacity: 0; }
.startup-art__orbit--three .startup-art__track i { width: 3px; height: 3px; top: -2px; }
.startup-art__halo { position: absolute; inset: 32%; border: 1px solid color-mix(in srgb, var(--buddy-accent-text) 12%, transparent); border-radius: 50%; box-shadow: 0 0 0 11px color-mix(in srgb, var(--buddy-accent-surface) 32%, transparent); animation: startup-breathe 4s ease-in-out infinite; }
.startup-art__core { position: absolute; inset: 36%; display: grid; place-items: center; border: 1px solid color-mix(in srgb, var(--buddy-accent-text) 18%, var(--buddy-border-subtle)); border-radius: 50%; background: radial-gradient(circle at 35% 25%, var(--buddy-surface-base), var(--buddy-accent-surface-subtle)); box-shadow: 0 12px 36px color-mix(in srgb, var(--buddy-accent-text) 12%, transparent), inset 0 1px 0 var(--buddy-surface-base); animation: startup-float 4s ease-in-out infinite; }
.startup-art__core img { width: 76%; height: 76%; object-fit: contain; }
.startup-art__star { position: absolute; width: 5px; height: 5px; background: var(--buddy-status-warning-text); clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%); animation: startup-twinkle 3.5s ease-in-out infinite; }
.startup-art__star:nth-last-child(2n) { width: 8px; height: 8px; }
.startup-art.is-still { opacity: 0.6; }
.startup-art.is-still * { animation: none; }
@keyframes startup-revolve { to { transform: rotate(360deg); } }
@keyframes startup-float { 0%, 100% { transform: translateY(1px); } 50% { transform: translateY(-5px); } }
@keyframes startup-breathe { 0%, 100% { opacity: 0.6; transform: scale(0.96); } 50% { opacity: 1; transform: scale(1.04); } }
@keyframes startup-twinkle { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 0.9; transform: scale(1.15); } }
@keyframes startup-chart-reveal { from { opacity: 0; transform: rotate(-12deg) scale(0.9); } to { opacity: 0.23; transform: rotate(0) scale(1); } }
@media (prefers-reduced-motion: reduce) { .startup-art * { animation: none; } }
</style>
