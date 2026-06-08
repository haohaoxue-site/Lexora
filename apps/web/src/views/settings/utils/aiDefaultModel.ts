import type { SettingsModelIntentGroup, SettingsModelIntentOption } from '../typing'
import { AI_MODEL_INTENT_KEY } from '@haohaoxue/samepage-contracts/ai/constants'

const CHAT_ASSISTANT_INTENT_OPTION: SettingsModelIntentOption = {
  key: AI_MODEL_INTENT_KEY.CHAT_ASSISTANT_DEFAULT,
  label: '对话',
  description: '对话使用。',
  parentKey: AI_MODEL_INTENT_KEY.CHAT_DEFAULT,
}

export const AI_MODEL_INTENT_GROUPS: SettingsModelIntentGroup[] = [
  {
    key: AI_MODEL_INTENT_KEY.CHAT_DEFAULT,
    label: '对话默认模型',
    description: '对话类能力兜底',
    children: [CHAT_ASSISTANT_INTENT_OPTION],
  },
]
