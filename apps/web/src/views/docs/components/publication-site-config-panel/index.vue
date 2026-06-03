<script setup lang="ts">
import type { FormInstance, FormRules, UploadRequestOptions } from 'element-plus'
import type {
  PublicationSiteConfigPanelEmits,
  PublicationSiteConfigPanelProps,
  SiteConfigForm,
  SiteHomeConfigDraft,
} from './typing'
import type {
  PublicationSite,
  PublicationSiteHomeConfig,
  PublicationSiteMediaKind,
} from '@/apis/document-publication'
import { Delete, Plus, Upload } from '@element-plus/icons-vue'
import {
  DOCUMENT_PUBLICATION_DEFAULT_SITE_HOME_CONFIG,
  DOCUMENT_PUBLICATION_SITE_FOOTER_COPYRIGHT_MAX_LENGTH,
  DOCUMENT_PUBLICATION_SITE_FOOTER_MESSAGE_MAX_LENGTH,
  DOCUMENT_PUBLICATION_SITE_HOME_MODE,
  DOCUMENT_PUBLICATION_SITE_HOME_NAME_MAX_LENGTH,
  DOCUMENT_PUBLICATION_SITE_HOME_TAGLINE_MAX_LENGTH,
  DOCUMENT_PUBLICATION_SITE_HOME_TEXT_MAX_LENGTH,
  DOCUMENT_PUBLICATION_SITE_MEDIA_KIND,
  DOCUMENT_PUBLICATION_SITE_MEDIA_MAX_BYTES_BY_KIND,
  DOCUMENT_PUBLICATION_SITE_MEDIA_MIME_TYPES,
  DOCUMENT_PUBLICATION_SITE_STATUS,
  DOCUMENT_PUBLICATION_SITE_THEME,
  DOCUMENT_PUBLICATION_SITE_TITLE_MAX_LENGTH,
} from '@haohaoxue/samepage-contracts/document/publication/constants'
import { prettyBytes } from '@haohaoxue/samepage-shared/file'
import { computed, reactive, useTemplateRef, watch } from 'vue'
import { ElMessage } from '@/utils/element-plus'

const props = withDefaults(defineProps<PublicationSiteConfigPanelProps>(), {
  loading: false,
  saving: false,
  uploadingMediaKind: null,
})
const emits = defineEmits<PublicationSiteConfigPanelEmits>()
const formRef = useTemplateRef<FormInstance>('formRef')

const siteConfigForm = reactive<SiteConfigForm>({
  title: '',
  logoUrl: '',
  siteAccessEnabled: true,
  heroName: '',
  heroText: '',
  heroTagline: '',
  heroImageUrl: '',
  footerMessage: '',
  footerCopyright: '',
})
const siteConfigRules: FormRules<SiteConfigForm> = {
  title: [
    { required: true, message: '请输入站点标题', trigger: 'blur' },
    {
      min: 1,
      max: DOCUMENT_PUBLICATION_SITE_TITLE_MAX_LENGTH,
      message: `站点标题不能超过 ${DOCUMENT_PUBLICATION_SITE_TITLE_MAX_LENGTH} 个字符`,
      trigger: 'blur',
    },
  ],
  heroName: [
    { required: true, message: '请输入首页名称', trigger: 'blur' },
    { min: 1, max: DOCUMENT_PUBLICATION_SITE_HOME_NAME_MAX_LENGTH, message: `首页名称不能超过 ${DOCUMENT_PUBLICATION_SITE_HOME_NAME_MAX_LENGTH} 个字符`, trigger: 'blur' },
  ],
  heroText: [
    { required: true, message: '请输入首页主文案', trigger: 'blur' },
    { min: 1, max: DOCUMENT_PUBLICATION_SITE_HOME_TEXT_MAX_LENGTH, message: `首页主文案不能超过 ${DOCUMENT_PUBLICATION_SITE_HOME_TEXT_MAX_LENGTH} 个字符`, trigger: 'blur' },
  ],
  heroTagline: [
    { max: DOCUMENT_PUBLICATION_SITE_HOME_TAGLINE_MAX_LENGTH, message: `首页说明不能超过 ${DOCUMENT_PUBLICATION_SITE_HOME_TAGLINE_MAX_LENGTH} 个字符`, trigger: 'blur' },
  ],
  footerMessage: [
    { max: DOCUMENT_PUBLICATION_SITE_FOOTER_MESSAGE_MAX_LENGTH, message: `页脚说明不能超过 ${DOCUMENT_PUBLICATION_SITE_FOOTER_MESSAGE_MAX_LENGTH} 个字符`, trigger: 'blur' },
  ],
  footerCopyright: [
    { max: DOCUMENT_PUBLICATION_SITE_FOOTER_COPYRIGHT_MAX_LENGTH, message: `版权信息不能超过 ${DOCUMENT_PUBLICATION_SITE_FOOTER_COPYRIGHT_MAX_LENGTH} 个字符`, trigger: 'blur' },
  ],
}

const mediaAccept = DOCUMENT_PUBLICATION_SITE_MEDIA_MIME_TYPES.join(',')
const siteLogoMediaSizeLimitLabel = prettyBytes(DOCUMENT_PUBLICATION_SITE_MEDIA_MAX_BYTES_BY_KIND[DOCUMENT_PUBLICATION_SITE_MEDIA_KIND.LOGO])
const homeLogoMediaSizeLimitLabel = prettyBytes(DOCUMENT_PUBLICATION_SITE_MEDIA_MAX_BYTES_BY_KIND[DOCUMENT_PUBLICATION_SITE_MEDIA_KIND.HOME_LOGO])
const isSiteLogoUploading = computed(() => props.uploadingMediaKind === DOCUMENT_PUBLICATION_SITE_MEDIA_KIND.LOGO)
const isHomeLogoUploading = computed(() => props.uploadingMediaKind === DOCUMENT_PUBLICATION_SITE_MEDIA_KIND.HOME_LOGO)
const isMediaUploading = computed(() => Boolean(props.uploadingMediaKind))
const isPersistedSiteAccessEnabled = computed(() => props.site?.status === DOCUMENT_PUBLICATION_SITE_STATUS.ACTIVE)
const sitePreviewUrl = computed(() => props.site && isPersistedSiteAccessEnabled.value ? `/s/${props.site.id}` : '')
const sitePreviewKey = computed(() => props.site ? `${props.site.id}:${props.site.updatedAt}` : 'empty')

watch(
  () => props.site,
  (site) => {
    if (props.uploadingMediaKind) {
      syncUploadedMediaFields(site, props.uploadingMediaKind)
      return
    }

    resetSiteConfigForm(site)
  },
  { immediate: true },
)

async function submitSiteConfig() {
  await formRef.value?.validate()

  emits('save', {
    title: siteConfigForm.title.trim(),
    logoUrl: toNullableText(siteConfigForm.logoUrl),
    theme: DOCUMENT_PUBLICATION_SITE_THEME.DEFAULT,
    status: siteConfigForm.siteAccessEnabled
      ? DOCUMENT_PUBLICATION_SITE_STATUS.ACTIVE
      : DOCUMENT_PUBLICATION_SITE_STATUS.DISABLED,
    homeMode: DOCUMENT_PUBLICATION_SITE_HOME_MODE.LANDING,
    homeDocumentId: null,
    homeConfig: buildHomeConfig(),
  })
}

function resetSiteConfigForm(site: PublicationSite | null) {
  const homeConfig = site?.homeConfig ?? cloneDefaultHomeConfig()

  siteConfigForm.title = site?.title ?? ''
  siteConfigForm.logoUrl = site?.logoUrl ?? ''
  siteConfigForm.siteAccessEnabled = !site || site.status === DOCUMENT_PUBLICATION_SITE_STATUS.ACTIVE
  siteConfigForm.heroName = homeConfig.hero.name
  siteConfigForm.heroText = homeConfig.hero.text
  siteConfigForm.heroTagline = homeConfig.hero.tagline ?? ''
  siteConfigForm.heroImageUrl = homeConfig.hero.imageUrl ?? ''
  siteConfigForm.footerMessage = homeConfig.footer.message ?? ''
  siteConfigForm.footerCopyright = homeConfig.footer.copyright ?? ''
  formRef.value?.clearValidate()
}

function buildHomeConfig(): PublicationSiteHomeConfig {
  const currentConfig = props.site?.homeConfig ?? cloneDefaultHomeConfig()

  return {
    hero: {
      name: siteConfigForm.heroName.trim(),
      text: siteConfigForm.heroText.trim(),
      tagline: toNullableText(siteConfigForm.heroTagline),
      imageUrl: toNullableText(siteConfigForm.heroImageUrl),
    },
    actions: currentConfig.actions,
    features: currentConfig.features,
    footer: {
      message: toNullableText(siteConfigForm.footerMessage),
      copyright: toNullableText(siteConfigForm.footerCopyright),
    },
  }
}

function beforeMediaUpload(kind: PublicationSiteMediaKind, file: File) {
  if (!(DOCUMENT_PUBLICATION_SITE_MEDIA_MIME_TYPES as readonly string[]).includes(file.type)) {
    ElMessage.error('站点图片仅支持 JPG、PNG、WEBP、SVG 格式')
    return false
  }

  const maxBytes = DOCUMENT_PUBLICATION_SITE_MEDIA_MAX_BYTES_BY_KIND[kind]

  if (file.size > maxBytes) {
    ElMessage.error(`站点图片大小不能超过 ${prettyBytes(maxBytes)}`)
    return false
  }

  return true
}

function handleMediaUploadRequest(kind: PublicationSiteMediaKind, options: UploadRequestOptions) {
  if (props.saving || isMediaUploading.value) {
    const error = new Error('站点图片正在上传')
    return Promise.reject(error)
  }

  emits('uploadMedia', kind, options.file)
  options.onSuccess({})
  return Promise.resolve({})
}

function handleRemoveMedia(kind: PublicationSiteMediaKind) {
  if (props.saving || isMediaUploading.value) {
    return
  }

  emits('removeMedia', kind)
}

function hidePreviewIframeScrollbar(event: Event) {
  const iframe = event.target as HTMLIFrameElement | null
  const frameDocument = iframe?.contentDocument

  if (!frameDocument) {
    return
  }

  frameDocument.documentElement.style.overflow = 'hidden'
  frameDocument.body.style.overflow = 'hidden'
}

function syncUploadedMediaFields(site: PublicationSite | null, kind: PublicationSiteMediaKind) {
  if (!site) {
    return
  }

  if (kind === DOCUMENT_PUBLICATION_SITE_MEDIA_KIND.LOGO) {
    siteConfigForm.logoUrl = site.logoUrl ?? ''
    return
  }

  siteConfigForm.heroImageUrl = site.homeConfig.hero.imageUrl ?? ''
}

function cloneDefaultHomeConfig(): SiteHomeConfigDraft {
  return JSON.parse(JSON.stringify(DOCUMENT_PUBLICATION_DEFAULT_SITE_HOME_CONFIG)) as PublicationSiteHomeConfig
}

function toNullableText(value: string | null | undefined) {
  const text = value?.trim() ?? ''

  return text || null
}
</script>

<template>
  <section v-loading="loading" class="publication-site-config-panel grid gap-5">
    <header class="publication-site-config-panel__header flex flex-wrap items-center justify-between gap-4">
      <h2 class="m-0 text-xl font-semibold leading-7 text-main">
        站点配置
      </h2>

      <div class="flex flex-wrap items-center justify-end gap-3">
        <div class="publication-site-config-panel__access-toggle flex items-center gap-3 rounded-lg border px-3 py-2">
          <span class="text-sm font-medium leading-5 text-main">开启访问</span>
          <ElSwitch
            v-model="siteConfigForm.siteAccessEnabled"
            size="small"
          />
        </div>
        <ElButton type="primary" :loading="saving" @click="submitSiteConfig">
          保存设置
        </ElButton>
      </div>
    </header>

    <div class="publication-site-config-panel__body grid items-start gap-5 max-[1280px]:grid-cols-1">
      <ElForm
        ref="formRef"
        :model="siteConfigForm"
        :rules="siteConfigRules"
        label-position="top"
        class="publication-site-config-panel__form rounded-xl border bg-surface"
      >
        <section class="publication-site-config-panel__section grid gap-3">
          <h2 class="m-0 text-base font-semibold leading-6 text-main">
            站点信息
          </h2>

          <div class="publication-site-config-panel__two-column grid gap-4 max-[720px]:grid-cols-1">
            <ElFormItem label="站点标题" prop="title">
              <ElInput
                v-model="siteConfigForm.title"
                :maxlength="DOCUMENT_PUBLICATION_SITE_TITLE_MAX_LENGTH"
                show-word-limit
              />
            </ElFormItem>

            <ElFormItem label="站点 Logo" prop="logoUrl">
              <div class="publication-site-config-panel__asset-row">
                <div class="publication-site-config-panel__asset-preview publication-site-config-panel__asset-preview--site">
                  <img
                    v-if="siteConfigForm.logoUrl"
                    :src="siteConfigForm.logoUrl"
                    alt="站点 Logo"
                  >
                  <div v-else class="publication-site-config-panel__asset-empty">
                    <ElIcon size="20">
                      <Plus />
                    </ElIcon>
                  </div>
                  <span v-if="isSiteLogoUploading" class="publication-site-config-panel__upload-mask">上传中...</span>
                </div>

                <div class="grid min-w-0 gap-0.5">
                  <span class="text-sm font-medium leading-5 text-main">站点导航标识</span>
                  <span class="text-xs leading-5 text-secondary">JPG、PNG、WEBP、SVG，最大 {{ siteLogoMediaSizeLimitLabel }}</span>
                </div>

                <div class="publication-site-config-panel__asset-actions">
                  <ElUpload
                    action="#"
                    :accept="mediaAccept"
                    :show-file-list="false"
                    :disabled="saving || isMediaUploading"
                    :before-upload="file => beforeMediaUpload(DOCUMENT_PUBLICATION_SITE_MEDIA_KIND.LOGO, file)"
                    :http-request="options => handleMediaUploadRequest(DOCUMENT_PUBLICATION_SITE_MEDIA_KIND.LOGO, options)"
                  >
                    <ElButton :icon="Upload" :disabled="saving || isMediaUploading">
                      上传
                    </ElButton>
                  </ElUpload>
                  <ElButton
                    v-if="siteConfigForm.logoUrl"
                    :icon="Delete"
                    :disabled="saving || isMediaUploading"
                    @click="handleRemoveMedia(DOCUMENT_PUBLICATION_SITE_MEDIA_KIND.LOGO)"
                  >
                    移除
                  </ElButton>
                </div>
              </div>
            </ElFormItem>
          </div>
        </section>

        <section class="publication-site-config-panel__section grid gap-3">
          <h2 class="m-0 text-base font-semibold leading-6 text-main">
            首页
          </h2>

          <div class="publication-site-config-panel__two-column grid gap-4 max-[720px]:grid-cols-1">
            <div class="grid content-start gap-3">
              <ElFormItem label="首页名称" prop="heroName">
                <ElInput
                  v-model="siteConfigForm.heroName"
                  :maxlength="DOCUMENT_PUBLICATION_SITE_HOME_NAME_MAX_LENGTH"
                  show-word-limit
                />
              </ElFormItem>

              <ElFormItem label="首页主文案" prop="heroText">
                <ElInput
                  v-model="siteConfigForm.heroText"
                  :maxlength="DOCUMENT_PUBLICATION_SITE_HOME_TEXT_MAX_LENGTH"
                  show-word-limit
                />
              </ElFormItem>

              <ElFormItem label="首页说明" prop="heroTagline">
                <ElInput
                  v-model="siteConfigForm.heroTagline"
                  type="textarea"
                  :rows="3"
                  :maxlength="DOCUMENT_PUBLICATION_SITE_HOME_TAGLINE_MAX_LENGTH"
                  show-word-limit
                />
              </ElFormItem>
            </div>

            <ElFormItem label="首页 Logo" prop="heroImageUrl">
              <div class="publication-site-config-panel__asset-row publication-site-config-panel__asset-row--home">
                <div class="publication-site-config-panel__asset-preview publication-site-config-panel__asset-preview--home">
                  <img
                    v-if="siteConfigForm.heroImageUrl"
                    :src="siteConfigForm.heroImageUrl"
                    alt="首页 Logo"
                  >
                  <div v-else class="publication-site-config-panel__asset-empty">
                    <ElIcon size="24">
                      <Plus />
                    </ElIcon>
                  </div>
                  <span v-if="isHomeLogoUploading" class="publication-site-config-panel__upload-mask">上传中...</span>
                </div>

                <div class="grid min-w-0 gap-0.5">
                  <span class="text-sm font-medium leading-5 text-main">首页视觉</span>
                  <span class="text-xs leading-5 text-secondary">用于站点首页首屏，最大 {{ homeLogoMediaSizeLimitLabel }}</span>
                </div>

                <div class="publication-site-config-panel__asset-actions">
                  <ElUpload
                    action="#"
                    :accept="mediaAccept"
                    :show-file-list="false"
                    :disabled="saving || isMediaUploading"
                    :before-upload="file => beforeMediaUpload(DOCUMENT_PUBLICATION_SITE_MEDIA_KIND.HOME_LOGO, file)"
                    :http-request="options => handleMediaUploadRequest(DOCUMENT_PUBLICATION_SITE_MEDIA_KIND.HOME_LOGO, options)"
                  >
                    <ElButton :icon="Upload" :disabled="saving || isMediaUploading">
                      上传
                    </ElButton>
                  </ElUpload>
                  <ElButton
                    v-if="siteConfigForm.heroImageUrl"
                    :icon="Delete"
                    :disabled="saving || isMediaUploading"
                    @click="handleRemoveMedia(DOCUMENT_PUBLICATION_SITE_MEDIA_KIND.HOME_LOGO)"
                  >
                    移除
                  </ElButton>
                </div>
              </div>
            </ElFormItem>
          </div>

          <div class="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
            <ElFormItem label="页脚说明" prop="footerMessage">
              <ElInput
                v-model="siteConfigForm.footerMessage"
                :maxlength="DOCUMENT_PUBLICATION_SITE_FOOTER_MESSAGE_MAX_LENGTH"
                show-word-limit
                clearable
              />
            </ElFormItem>

            <ElFormItem label="版权信息" prop="footerCopyright">
              <ElInput
                v-model="siteConfigForm.footerCopyright"
                :maxlength="DOCUMENT_PUBLICATION_SITE_FOOTER_COPYRIGHT_MAX_LENGTH"
                show-word-limit
                clearable
              />
            </ElFormItem>
          </div>
        </section>
      </ElForm>

      <aside class="publication-site-config-panel__preview grid gap-3 rounded-xl border bg-surface p-4">
        <div class="flex items-center gap-3">
          <h2 class="m-0 text-base font-semibold leading-6 text-main">
            首页预览
          </h2>
        </div>

        <div class="publication-site-config-panel__site-preview overflow-hidden rounded-xl border">
          <iframe
            v-if="sitePreviewUrl"
            :key="sitePreviewKey"
            class="h-full w-full border-0"
            :src="sitePreviewUrl"
            scrolling="no"
            title="公开站点首页预览"
            @load="hidePreviewIframeScrollbar"
          />
          <div v-else class="grid h-full place-items-center px-6 text-center">
            <div class="grid gap-1">
              <strong class="text-sm font-semibold leading-5 text-main">
                {{ site ? '站点已关闭' : '保存设置后生成预览' }}
              </strong>
              <span class="text-xs leading-5 text-secondary">
                {{ site ? '开启访问后可查看真实首页。' : '真实预览会加载公开站点首页。' }}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped lang="scss">
.publication-site-config-panel__form,
.publication-site-config-panel__preview {
  border-color: color-mix(in srgb, var(--brand-border-base) 72%, transparent);
  box-shadow: var(--brand-shadow-hairline);
}

.publication-site-config-panel__form {
  max-height: calc(100vh - 11rem);
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.publication-site-config-panel__body {
  min-height: 0;
  grid-template-columns: minmax(34rem, 0.95fr) minmax(30rem, 1.05fr);
  align-items: stretch;
}

.publication-site-config-panel__access-toggle {
  border-color: color-mix(in srgb, var(--brand-border-base) 72%, transparent);
  background: color-mix(in srgb, var(--brand-fill-lighter) 32%, var(--brand-bg-surface));
}

.publication-site-config-panel__two-column {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.publication-site-config-panel__asset-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 1rem;
  align-items: center;
  min-height: 4.5rem;
  padding: 0.75rem;
  border: 1px solid color-mix(in srgb, var(--brand-border-base) 70%, transparent);
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--brand-fill-lighter) 28%, var(--brand-bg-surface));
}

.publication-site-config-panel__asset-row--home {
  grid-template-columns: minmax(0, 1fr);
  min-height: 7.25rem;
}

.publication-site-config-panel__asset-preview {
  position: relative;
  display: grid;
  place-items: center;
  overflow: hidden;
  width: 3rem;
  height: 3rem;
  border: 1px dashed color-mix(in srgb, var(--brand-border-base) 86%, transparent);
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--brand-fill-lighter) 58%, var(--brand-bg-surface));
  color: var(--brand-text-secondary);

  img {
    display: block;
    max-width: calc(100% - 0.5rem);
    max-height: calc(100% - 0.5rem);
    object-fit: contain;
  }
}

.publication-site-config-panel__asset-preview--home {
  width: 100%;
  height: 8rem;
}

.publication-site-config-panel__asset-empty {
  display: grid;
  place-items: center;
}

.publication-site-config-panel__asset-actions {
  grid-column: 2;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 0.5rem;
}

.publication-site-config-panel__asset-row--home .publication-site-config-panel__asset-actions {
  grid-column: auto;
}

.publication-site-config-panel__asset-actions :deep(.el-upload) {
  display: block;
}

.publication-site-config-panel__upload-mask {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--brand-bg-surface) 78%, transparent);
  color: var(--brand-text-primary);
  font-size: 0.8125rem;
  font-weight: 600;
}

.publication-site-config-panel__section + .publication-site-config-panel__section {
  border-top: 1px solid color-mix(in srgb, var(--brand-border-base) 66%, transparent);
}

.publication-site-config-panel__site-preview {
  height: clamp(36rem, calc(100vh - 13rem), 44rem);
  min-height: 36rem;
  border: 1px solid color-mix(in srgb, var(--brand-border-base) 92%, var(--brand-text-tertiary) 8%);
  background: var(--brand-bg-surface);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--brand-border-base) 70%, transparent),
    var(--brand-shadow-hairline);
}

@media (max-width: 1280px) {
  .publication-site-config-panel__body {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .publication-site-config-panel__site-preview {
    height: 30rem;
    min-height: 30rem;
  }

  .publication-site-config-panel__asset-row,
  .publication-site-config-panel__asset-row--home {
    grid-template-columns: minmax(0, 1fr);
  }

  .publication-site-config-panel__asset-preview,
  .publication-site-config-panel__asset-preview--home {
    width: 100%;
    height: 7.5rem;
  }

  .publication-site-config-panel__asset-actions {
    justify-content: flex-start;
  }
}
</style>
