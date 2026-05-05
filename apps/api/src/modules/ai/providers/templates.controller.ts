import type { AiModelProviderTemplate } from '@haohaoxue/samepage-contracts'
import { Controller, Get } from '@nestjs/common'
import { AiProviderTemplatesService } from './templates.service'

@Controller('ai')
export class AiTemplateController {
  constructor(private readonly templatesService: AiProviderTemplatesService) {}

  @Get('model-provider-templates')
  getTemplates(): AiModelProviderTemplate[] {
    return this.templatesService.getTemplates()
  }

  @Get('model-provider-templates/compatible')
  getCompatibleTemplates(): AiModelProviderTemplate[] {
    return this.templatesService.getCompatibleTemplates()
  }
}
