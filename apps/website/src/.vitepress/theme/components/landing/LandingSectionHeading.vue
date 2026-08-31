<script setup lang="ts">
withDefaults(defineProps<{
  kicker: string
  title: string
  description: string
  tone?: 'default' | 'light'
  align?: 'left' | 'center'
}>(), {
  tone: 'default',
  align: 'left',
})
</script>

<template>
  <header
    class="section-heading"
    :class="[
      `section-heading--${tone}`,
      `section-heading--${align}`,
    ]"
  >
    <p class="section-heading__kicker">
      {{ kicker }}
    </p>
    <h2 class="section-heading__title">
      {{ title }}
    </h2>
    <p class="section-heading__description">
      {{ description }}
    </p>
  </header>
</template>

<style scoped>
.section-heading {
  max-width: 760px;
}

.section-heading--center {
  margin-inline: auto;
  text-align: center;
}

.section-heading__kicker {
  margin: 0 0 18px;
  color: var(--landing-accent-strong);
  font-family: var(--landing-font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  line-height: 1.4;
}

.section-heading__title {
  margin: 0;
  color: var(--landing-ink);
  font-family: var(--landing-font-display);
  font-size: clamp(38px, 5vw, 68px);
  font-weight: 500;
  letter-spacing: -0.045em;
  line-height: 1.02;
  white-space: pre-line;
}

.section-heading__description {
  max-width: 660px;
  margin: 24px 0 0;
  color: var(--landing-muted);
  font-size: clamp(16px, 1.8vw, 19px);
  line-height: 1.75;
}

.section-heading--center .section-heading__description {
  margin-inline: auto;
}

.section-heading--light .section-heading__kicker {
  color: var(--landing-highlight);
}

.section-heading--light .section-heading__title {
  color: var(--landing-dark-ink);
}

.section-heading--light .section-heading__description {
  color: var(--landing-dark-muted);
}

@media (max-width: 640px) {
  .section-heading__kicker {
    margin-bottom: 14px;
  }

  .section-heading__description {
    margin-top: 18px;
    font-size: 16px;
  }
}
</style>
