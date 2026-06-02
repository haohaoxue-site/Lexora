<script setup lang="ts">
import type { PublicationSingleDocumentPageProps } from './typing'
import type { DocumentBodyEditorOutlineOptions } from '@/components/tiptap-editor'
import { computed } from 'vue'
import { SvgIcon } from '@/components/svg-icon'
import dayjs from '@/utils/dayjs'
import PublicationDocumentContent from '../../components/document-content'

const props = defineProps<PublicationSingleDocumentPageProps>()
const ownerName = computed(() => props.document.owner?.displayName || '用户')
const documentTitle = computed(() => props.document.title || '未命名')
const updatedAtText = computed(() => dayjs(props.document.updatedAt).format('YYYY年MM月DD日'))
const outlineOptions: DocumentBodyEditorOutlineOptions = {
  defaultExpanded: true,
  layout: 'side',
  mode: 'manual',
  placement: 'right',
  showSearch: false,
  surface: 'transparent',
}
</script>

<template>
  <section class="publication-single-document-page flex h-screen min-h-0 flex-col overflow-hidden">
    <header class="publication-single-document-page__topbar flex min-h-14 flex-[0_0_auto] items-center justify-between gap-5 px-[clamp(1rem,2vw,1.75rem)] py-2 max-[560px]:flex-col max-[560px]:items-start max-[560px]:gap-1">
      <div class="publication-single-document-page__titlebar grid min-w-0 gap-px">
        <div class="publication-single-document-page__breadcrumb flex min-w-0 items-center text-[13px] leading-[1.35] text-secondary">
          <span class="publication-single-document-page__owner">{{ ownerName }}</span>
          <SvgIcon category="ui" icon="chevron-right" size="12px" />
          <strong class="publication-single-document-page__title font-bold text-main">{{ documentTitle }}</strong>
        </div>

        <p class="publication-single-document-page__time m-0 whitespace-nowrap text-xs leading-[1.4] text-[color-mix(in_srgb,var(--brand-text-tertiary)_68%,transparent)] max-[560px]:whitespace-normal">
          最近修改：{{ updatedAtText }}
        </p>
      </div>

      <p class="publication-single-document-page__auth-hint m-0 flex-[0_1_auto] whitespace-nowrap text-right text-xs leading-[1.5] text-[color-mix(in_srgb,var(--brand-text-tertiary)_74%,transparent)] max-[560px]:whitespace-normal max-[560px]:text-left">
        立即<RouterLink :to="{ name: 'login' }" class="publication-single-document-page__auth-link font-medium text-primary underline">
          注册或登录
        </RouterLink>，开始你的文档之旅吧~
      </p>
    </header>

    <div class="publication-single-document-page__layout min-h-0 w-full flex-1 overflow-auto">
      <main class="publication-single-document-page__main flex min-h-full min-w-0 justify-center px-[clamp(1.25rem,5vw,3rem)] pt-[clamp(1.75rem,4vw,3rem)] pb-20 max-[860px]:px-5 max-[860px]:pt-6 max-[860px]:pb-16">
        <PublicationDocumentContent
          :document="props.document"
          :body="props.body"
          layout="plain"
          :outline-options="outlineOptions"
          :show-meta="false"
        />
      </main>
    </div>
  </section>
</template>

<style scoped lang="scss">
.publication-single-document-page {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--brand-fill-blank) 70%, transparent) 0, transparent 9rem),
    var(--brand-bg-surface);
}

.publication-single-document-page__topbar {
  border-bottom: 1px solid color-mix(in srgb, var(--brand-border-base) 70%, transparent);
  background: var(--brand-bg-surface);
}

.publication-single-document-page__owner,
.publication-single-document-page__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.publication-single-document-page__owner {
  max-width: 8rem;
}

.publication-single-document-page__title {
  max-width: min(38rem, 48vw);
}

.publication-single-document-page__auth-link {
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--brand-primary) 42%, transparent);
  text-underline-offset: 0.18em;

  &:hover,
  &:focus-visible {
    text-decoration-color: currentColor;
  }
}
</style>
