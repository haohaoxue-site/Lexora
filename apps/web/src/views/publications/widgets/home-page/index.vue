<script setup lang="ts">
import type { PublicationHomePageProps } from './typing'
import { normalizePublicationHref } from '@haohaoxue/samepage-shared'
import { useRouter } from 'vue-router'

const props = defineProps<PublicationHomePageProps>()
const router = useRouter()

function handleActionClick(href: string, event: MouseEvent) {
  const safeHref = normalizePublicationHref(href)

  if (!safeHref) {
    event.preventDefault()
    return
  }

  if (
    event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
    || event.button !== 0
    || !safeHref.startsWith('/')
  ) {
    return
  }

  event.preventDefault()
  void router.push(safeHref)
}

function resolveActionHref(href: string) {
  return normalizePublicationHref(href) ?? undefined
}
</script>

<template>
  <main class="publication-home-page mx-auto w-[min(100%,72rem)] px-6 pt-[clamp(4rem,9vw,7rem)] pb-12 max-[640px]:px-4 max-[640px]:pt-10 max-[640px]:pb-8">
    <section class="publication-home-page__hero grid grid-cols-[minmax(0,1fr)_minmax(16rem,26rem)] items-center gap-[clamp(3rem,8vw,7rem)] max-[960px]:grid-cols-1">
      <div class="publication-home-page__hero-copy min-w-0">
        <p class="publication-home-page__name m-0 mb-1 text-[clamp(2.25rem,5vw,3.6rem)] font-800 leading-none text-transparent">
          {{ props.home.hero.name || props.site.title }}
        </p>
        <h1 class="max-w-[11em] m-0 text-[clamp(2.35rem,5.6vw,4.2rem)] font-800 leading-[1.1] text-main">
          {{ props.home.hero.text || props.site.title }}
        </h1>
        <p v-if="props.home.hero.tagline || props.site.description" class="publication-home-page__tagline mt-4 max-w-[34rem] text-lg leading-7 text-secondary">
          {{ props.home.hero.tagline || props.site.description }}
        </p>

        <div v-if="props.home.actions.length" class="publication-home-page__actions mt-7 flex flex-wrap gap-3">
          <a
            v-for="action in props.home.actions"
            :key="`${action.label}-${action.href}`"
            class="publication-home-page__action inline-flex min-h-10 items-center justify-center rounded-full px-4 text-sm font-bold leading-[1.4] no-underline"
            :class="`is-${action.theme}`"
            :href="resolveActionHref(action.href)"
            @click="handleActionClick(action.href, $event)"
          >
            {{ action.label }}
          </a>
        </div>
      </div>

      <div class="publication-home-page__visual flex justify-center max-[960px]:order-[-1] max-[960px]:justify-start">
        <img
          v-if="props.home.hero.imageUrl || props.site.logoUrl"
          class="publication-home-page__hero-image max-h-[21rem] w-[min(100%,21rem)] object-contain max-[960px]:w-32"
          :src="props.home.hero.imageUrl || props.site.logoUrl || ''"
          alt=""
        >
        <div
          v-else
          class="publication-home-page__fallback-visual relative grid w-[min(100%,17rem)] [aspect-ratio:0.82] content-start gap-4 rounded-2xl p-8 max-[960px]:w-32 max-[960px]:rounded-xl max-[960px]:p-3"
          aria-hidden="true"
        >
          <span class="publication-home-page__fallback-mark inline-flex h-16 w-16 items-center justify-center rounded-xl text-2xl font-800 text-primary max-[960px]:h-8 max-[960px]:w-8 max-[960px]:rounded-lg max-[960px]:text-xs">SP</span>
          <span class="publication-home-page__fallback-line is-wide block h-2 rounded-full max-[960px]:h-1" />
          <span class="publication-home-page__fallback-line block h-2 rounded-full max-[960px]:h-1" />
          <span class="publication-home-page__fallback-chip absolute bottom-6 right-6 rounded-lg px-2 py-1 text-xs font-800 leading-[1.2] text-white max-[960px]:bottom-3 max-[960px]:right-3 max-[960px]:px-1.5 max-[960px]:py-0.5 max-[960px]:text-[10px]">Docs</span>
        </div>
      </div>
    </section>

    <section v-if="props.home.features.length" class="publication-home-page__features mt-[clamp(4rem,9vw,6rem)] grid grid-cols-4 gap-4 max-[960px]:grid-cols-2 max-[640px]:grid-cols-1" aria-label="特性">
      <article
        v-for="feature in props.home.features"
        :key="feature.title"
        class="publication-home-page__feature min-w-0 rounded-lg p-5"
      >
        <span v-if="feature.icon" class="publication-home-page__feature-icon mb-4 inline-flex h-9 w-9 items-center justify-center rounded-md text-lg">{{ feature.icon }}</span>
        <h2 class="publication-home-page__feature-title m-0 text-base font-bold leading-[1.45] text-main">
          {{ feature.title }}
        </h2>
        <p v-if="feature.details" class="publication-home-page__feature-details mt-2 text-sm leading-[1.75] text-secondary">
          {{ feature.details }}
        </p>
      </article>
    </section>

    <footer
      v-if="props.home.footer.message || props.home.footer.copyright"
      class="publication-home-page__footer mt-24 mx-[calc(50%-50vw)] grid gap-1 border-t px-4 py-7 text-center text-[13px] leading-[1.65] text-[var(--brand-text-tertiary)]"
    >
      <p v-if="props.home.footer.message" class="m-0">
        {{ props.home.footer.message }}
      </p>
      <p v-if="props.home.footer.copyright" class="m-0">
        {{ props.home.footer.copyright }}
      </p>
    </footer>
  </main>
</template>

<style scoped lang="scss">
.publication-home-page__name {
  background: linear-gradient(120deg, var(--brand-primary) 0%, color-mix(in srgb, var(--brand-primary) 58%, #ff4fd8 42%) 100%);
  background-clip: text;
}

.publication-home-page__action {
  &.is-brand {
    background: var(--brand-primary);
    color: var(--brand-bg-surface);
  }

  &.is-alt {
    background: color-mix(in srgb, var(--brand-fill-blank) 90%, var(--brand-primary) 10%);
    color: var(--brand-text-primary);
  }
}

.publication-home-page__fallback-visual {
  transform: rotate(7deg);
  border: 0.8rem solid color-mix(in srgb, var(--brand-primary) 72%, #ffffff 28%);
  background: var(--brand-bg-surface);
  box-shadow:
    0 1.1rem 0 color-mix(in srgb, var(--brand-primary) 26%, #111827 74%),
    0 2.5rem 4rem color-mix(in srgb, var(--brand-primary) 24%, transparent);
}

.publication-home-page__fallback-mark {
  background: color-mix(in srgb, var(--brand-primary) 12%, transparent);
}

.publication-home-page__fallback-line {
  width: 62%;
  background: color-mix(in srgb, var(--brand-primary) 16%, transparent);

  &.is-wide {
    width: 86%;
  }
}

.publication-home-page__fallback-chip {
  background: color-mix(in srgb, var(--brand-primary) 86%, #ffffff 14%);
}

.publication-home-page__feature {
  background: color-mix(in srgb, var(--brand-fill-blank) 92%, var(--brand-primary) 8%);
}

.publication-home-page__feature-icon {
  background: var(--brand-bg-surface);
}

.publication-home-page__footer {
  border-top: 1px solid color-mix(in srgb, var(--brand-border-base) 65%, transparent);
}

@media (max-width: 960px) {
  .publication-home-page__fallback-visual {
    border-width: 0.5rem;
    box-shadow:
      0 0.55rem 0 color-mix(in srgb, var(--brand-primary) 26%, #111827 74%),
      0 1.35rem 2.5rem color-mix(in srgb, var(--brand-primary) 22%, transparent);
  }
}
</style>
