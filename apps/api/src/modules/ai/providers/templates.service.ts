import type { AiModelProviderTemplate } from '@haohaoxue/samepage-contracts'
import { Injectable, NotFoundException } from '@nestjs/common'
import {
  AI_BUILTIN_PROVIDER_TEMPLATES,
  AI_COMPATIBLE_PROVIDER_TEMPLATES,
  AI_PROVIDER_TEMPLATES,
} from '../ai.registry'

@Injectable()
export class AiProviderTemplatesService {
  getTemplates(): AiModelProviderTemplate[] {
    return this.cloneTemplates(AI_BUILTIN_PROVIDER_TEMPLATES)
  }

  getCompatibleTemplates(): AiModelProviderTemplate[] {
    return this.cloneTemplates(AI_COMPATIBLE_PROVIDER_TEMPLATES)
  }

  getTemplateOrThrow(providerKey: string): AiModelProviderTemplate {
    const template = AI_PROVIDER_TEMPLATES.find(item => item.providerKey === providerKey)

    if (!template) {
      throw new NotFoundException(`模型服务商模板不存在：${providerKey}`)
    }

    return {
      ...template,
      supportedModelTypes: [...template.supportedModelTypes],
    }
  }

  private cloneTemplates(templates: readonly AiModelProviderTemplate[]): AiModelProviderTemplate[] {
    return templates.map(template => ({
      ...template,
      supportedModelTypes: [...template.supportedModelTypes],
    }))
  }
}
