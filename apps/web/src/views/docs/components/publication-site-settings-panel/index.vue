<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus'
import type {
  DocumentSelectNode,
  PublicationSiteSettingsPanelEmits,
  PublicationSiteSettingsPanelProps,
  SiteHomeConfigDraft,
  SiteSettingsDraft,
  SiteSettingsForm,
} from './typing'
import type {
  DocumentSinglePublicationTreeItem,
  PublicationSite,
  PublicationSiteHomeConfig,
} from '@/apis/document-publication'
import {
  DOCUMENT_PUBLICATION_DEFAULT_SITE_HOME_CONFIG,
  DOCUMENT_PUBLICATION_SITE_HOME_MODE,
  DOCUMENT_PUBLICATION_SITE_THEME,
} from '@haohaoxue/samepage-contracts'
import { computed, reactive, useTemplateRef, watch } from 'vue'

const props = withDefaults(defineProps<PublicationSiteSettingsPanelProps>(), {
  loading: false,
  saving: false,
})
const emits = defineEmits<PublicationSiteSettingsPanelEmits>()
const formRef = useTemplateRef<FormInstance>('formRef')

const settingsForm = reactive<SiteSettingsForm>({
  title: '',
  description: '',
  logoUrl: '',
  theme: DOCUMENT_PUBLICATION_SITE_THEME.DEFAULT,
  homeMode: DOCUMENT_PUBLICATION_SITE_HOME_MODE.LANDING,
  homeDocumentId: '',
  allowIndexing: false,
  heroName: '',
  heroText: '',
  heroTagline: '',
  heroImageUrl: '',
  footerMessage: '',
  footerCopyright: '',
})
const settingsRules: FormRules<SiteSettingsForm> = {
  title: [
    { required: true, message: '请输入站点标题', trigger: 'blur' },
    { min: 1, max: 120, message: '站点标题不能超过 120 个字符', trigger: 'blur' },
  ],
  heroName: [
    { required: true, message: '请输入首页名称', trigger: 'blur' },
    { min: 1, max: 80, message: '首页名称不能超过 80 个字符', trigger: 'blur' },
  ],
  heroText: [
    { required: true, message: '请输入首页主文案', trigger: 'blur' },
    { min: 1, max: 120, message: '首页主文案不能超过 120 个字符', trigger: 'blur' },
  ],
}

const documentOptions = computed(() => props.tree.map(toDocumentSelectNode))

watch(
  () => props.site,
  (site) => {
    resetForm(site)
  },
  { immediate: true },
)

async function submitSettings() {
  await formRef.value?.validate()

  emits('save', {
    title: settingsForm.title.trim(),
    description: toNullableText(settingsForm.description),
    logoUrl: toNullableText(settingsForm.logoUrl),
    theme: DOCUMENT_PUBLICATION_SITE_THEME.DEFAULT,
    homeMode: settingsForm.homeMode as SiteSettingsDraft['homeMode'],
    homeDocumentId: settingsForm.homeMode === DOCUMENT_PUBLICATION_SITE_HOME_MODE.DOCUMENT
      ? toNullableText(settingsForm.homeDocumentId)
      : null,
    allowIndexing: settingsForm.allowIndexing,
    homeConfig: buildHomeConfig(),
  })
}

function resetForm(site: PublicationSite | null) {
  const homeConfig = site?.homeConfig ?? cloneDefaultHomeConfig()

  settingsForm.title = site?.title ?? ''
  settingsForm.description = site?.description ?? ''
  settingsForm.logoUrl = site?.logoUrl ?? ''
  settingsForm.theme = site?.theme ?? DOCUMENT_PUBLICATION_SITE_THEME.DEFAULT
  settingsForm.homeMode = site?.homeMode ?? DOCUMENT_PUBLICATION_SITE_HOME_MODE.LANDING
  settingsForm.homeDocumentId = site?.homeDocumentId ?? ''
  settingsForm.allowIndexing = site?.allowIndexing ?? false
  settingsForm.heroName = homeConfig.hero.name
  settingsForm.heroText = homeConfig.hero.text
  settingsForm.heroTagline = homeConfig.hero.tagline ?? ''
  settingsForm.heroImageUrl = homeConfig.hero.imageUrl ?? ''
  settingsForm.footerMessage = homeConfig.footer.message ?? ''
  settingsForm.footerCopyright = homeConfig.footer.copyright ?? ''
  formRef.value?.clearValidate()
}

function buildHomeConfig(): PublicationSiteHomeConfig {
  const currentConfig = props.site?.homeConfig ?? cloneDefaultHomeConfig()

  return {
    hero: {
      name: settingsForm.heroName.trim(),
      text: settingsForm.heroText.trim(),
      tagline: toNullableText(settingsForm.heroTagline),
      imageUrl: toNullableText(settingsForm.heroImageUrl),
    },
    actions: currentConfig.actions,
    features: currentConfig.features,
    footer: {
      message: toNullableText(settingsForm.footerMessage),
      copyright: toNullableText(settingsForm.footerCopyright),
    },
  }
}

function cloneDefaultHomeConfig(): SiteHomeConfigDraft {
  return JSON.parse(JSON.stringify(DOCUMENT_PUBLICATION_DEFAULT_SITE_HOME_CONFIG)) as PublicationSiteHomeConfig
}

function toDocumentSelectNode(item: DocumentSinglePublicationTreeItem): DocumentSelectNode {
  return {
    value: item.id,
    label: item.title || '未命名',
    children: item.children.map(toDocumentSelectNode),
  }
}

function toNullableText(value: string | null | undefined) {
  const text = value?.trim() ?? ''

  return text || null
}
</script>

<template>
  <section v-loading="loading" class="publication-site-settings-panel grid w-full max-w-[52rem] gap-4">
    <ElForm
      ref="formRef"
      :model="settingsForm"
      :rules="settingsRules"
      label-position="top"
      class="grid gap-1"
    >
      <div class="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
        <ElFormItem label="站点标题" prop="title">
          <ElInput v-model="settingsForm.title" maxlength="120" show-word-limit />
        </ElFormItem>

        <ElFormItem label="Logo URL" prop="logoUrl">
          <ElInput v-model="settingsForm.logoUrl" maxlength="500" clearable />
        </ElFormItem>
      </div>

      <ElFormItem label="站点描述" prop="description">
        <ElInput
          v-model="settingsForm.description"
          type="textarea"
          :rows="2"
          maxlength="240"
          show-word-limit
        />
      </ElFormItem>

      <div class="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
        <ElFormItem label="主题" prop="theme">
          <ElSelect v-model="settingsForm.theme" disabled>
            <ElOption label="默认" :value="DOCUMENT_PUBLICATION_SITE_THEME.DEFAULT" />
          </ElSelect>
        </ElFormItem>

        <ElFormItem label="首页模式" prop="homeMode">
          <ElSelect v-model="settingsForm.homeMode">
            <ElOption label="展示首页" :value="DOCUMENT_PUBLICATION_SITE_HOME_MODE.LANDING" />
            <ElOption label="指定文档" :value="DOCUMENT_PUBLICATION_SITE_HOME_MODE.DOCUMENT" />
          </ElSelect>
        </ElFormItem>
      </div>

      <ElFormItem
        v-if="settingsForm.homeMode === DOCUMENT_PUBLICATION_SITE_HOME_MODE.DOCUMENT"
        label="首页文档"
        prop="homeDocumentId"
      >
        <ElTreeSelect
          v-model="settingsForm.homeDocumentId"
          :data="documentOptions"
          clearable
          filterable
          check-strictly
          default-expand-all
          placeholder="选择作为首页的文档"
        />
      </ElFormItem>

      <div class="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
        <ElFormItem label="首页名称" prop="heroName">
          <ElInput v-model="settingsForm.heroName" maxlength="80" show-word-limit />
        </ElFormItem>

        <ElFormItem label="首页主文案" prop="heroText">
          <ElInput v-model="settingsForm.heroText" maxlength="120" show-word-limit />
        </ElFormItem>
      </div>

      <ElFormItem label="首页说明" prop="heroTagline">
        <ElInput
          v-model="settingsForm.heroTagline"
          type="textarea"
          :rows="2"
          maxlength="240"
          show-word-limit
        />
      </ElFormItem>

      <ElFormItem label="首页图片 URL" prop="heroImageUrl">
        <ElInput v-model="settingsForm.heroImageUrl" maxlength="500" clearable />
      </ElFormItem>

      <div class="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
        <ElFormItem label="页脚信息" prop="footerMessage">
          <ElInput v-model="settingsForm.footerMessage" maxlength="160" clearable />
        </ElFormItem>

        <ElFormItem label="版权信息" prop="footerCopyright">
          <ElInput v-model="settingsForm.footerCopyright" maxlength="160" clearable />
        </ElFormItem>
      </div>

      <ElFormItem label="搜索引擎索引" prop="allowIndexing">
        <ElSwitch
          v-model="settingsForm.allowIndexing"
          active-text="允许"
          inactive-text="不允许"
        />
      </ElFormItem>
    </ElForm>

    <div class="flex justify-end">
      <ElButton type="primary" :loading="saving" @click="submitSettings">
        保存站点设置
      </ElButton>
    </div>
  </section>
</template>
