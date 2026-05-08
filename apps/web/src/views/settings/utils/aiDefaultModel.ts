import type { SettingsModelIntentGroup, SettingsModelIntentOption } from '../typing'
import { AI_MODEL_INTENT_KEY } from '@haohaoxue/samepage-contracts'

const CHAT_ASSISTANT_INTENT_OPTION: SettingsModelIntentOption = {
  key: AI_MODEL_INTENT_KEY.CHAT_ASSISTANT_DEFAULT,
  label: '对话',
  description: '对话使用。',
  parentKey: AI_MODEL_INTENT_KEY.CHAT_DEFAULT,
}

const DOCUMENT_GENERATE_INTENT_OPTION: SettingsModelIntentOption = {
  key: AI_MODEL_INTENT_KEY.DOCUMENT_GENERATE_DEFAULT,
  label: '新内容生成、段落扩写',
  description: '空段落生成、续写和扩写类入口使用。',
  parentKey: AI_MODEL_INTENT_KEY.DOCUMENT_DEFAULT,
}

const DOCUMENT_REWRITE_INTENT_OPTION: SettingsModelIntentOption = {
  key: AI_MODEL_INTENT_KEY.DOCUMENT_REWRITE_DEFAULT,
  label: '润色、改写',
  description: '选中文本后的润色、改写和风格调整入口使用。',
  parentKey: AI_MODEL_INTENT_KEY.DOCUMENT_DEFAULT,
}

export const AI_MODEL_INTENT_GROUPS: SettingsModelIntentGroup[] = [
  {
    key: AI_MODEL_INTENT_KEY.CHAT_DEFAULT,
    label: '对话默认模型',
    description: '对话类能力兜底',
    children: [CHAT_ASSISTANT_INTENT_OPTION],
  },
  {
    key: AI_MODEL_INTENT_KEY.DOCUMENT_DEFAULT,
    label: '文档默认模型',
    description: '文档编辑能力兜底',
    children: [
      DOCUMENT_GENERATE_INTENT_OPTION,
      DOCUMENT_REWRITE_INTENT_OPTION,
    ],
  },
]
