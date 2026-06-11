import type {
  AgentTranslatorFormality,
  AgentTranslatorOutputMode,
  AgentTranslatorSkillConfig,
} from '@haohaoxue/samepage-contracts/agent'
import {
  AGENT_TRANSLATOR_DEFAULT_SKILL_CONFIG,
  AGENT_TRANSLATOR_FORMALITY,
  AGENT_TRANSLATOR_OUTPUT_MODE,
  AGENT_TRANSLATOR_SKILL_KEY,
  AgentTranslatorSkillConfigSchema,
} from '@haohaoxue/samepage-contracts/agent'

export const TRANSLATOR_SKILL_KEY = AGENT_TRANSLATOR_SKILL_KEY

export const translatorOutputModeOptions: Array<{ label: string, value: AgentTranslatorOutputMode }> = [
  { label: '译文', value: AGENT_TRANSLATOR_OUTPUT_MODE.TRANSLATION_ONLY },
  { label: '双语', value: AGENT_TRANSLATOR_OUTPUT_MODE.BILINGUAL },
  { label: '译+注', value: AGENT_TRANSLATOR_OUTPUT_MODE.WITH_NOTES },
]

export const translatorFormalityOptions: Array<{ label: string, value: AgentTranslatorFormality }> = [
  { label: '自动', value: AGENT_TRANSLATOR_FORMALITY.AUTO },
  { label: '中性', value: AGENT_TRANSLATOR_FORMALITY.NEUTRAL },
  { label: '正式', value: AGENT_TRANSLATOR_FORMALITY.FORMAL },
  { label: '口语', value: AGENT_TRANSLATOR_FORMALITY.CASUAL },
]

export interface TranslatorConfigFormModel {
  preserveFormatting: boolean
  outputMode: AgentTranslatorOutputMode
  formality: AgentTranslatorFormality
}

export function parseTranslatorSkillConfig(config: unknown): AgentTranslatorSkillConfig {
  return AgentTranslatorSkillConfigSchema.parse(config ?? AGENT_TRANSLATOR_DEFAULT_SKILL_CONFIG)
}

export function createTranslatorConfigFormModel(config: unknown): TranslatorConfigFormModel {
  const parsed = parseTranslatorSkillConfig(config)

  return {
    preserveFormatting: parsed.preserveFormatting,
    outputMode: parsed.outputMode,
    formality: parsed.formality,
  }
}

export function toTranslatorSkillConfig(model: TranslatorConfigFormModel): AgentTranslatorSkillConfig {
  return AgentTranslatorSkillConfigSchema.parse({
    preserveFormatting: model.preserveFormatting,
    outputMode: model.outputMode,
    formality: model.formality,
  })
}
