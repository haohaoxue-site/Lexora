import { Module } from '@nestjs/common'
import { AgentModule } from '../agent/agent.module'
import { DocumentsModule } from '../documents/documents.module'

// editor
import { AiEditorAgentInternalController } from './editor/agent-internal.controller'
import { AiEditorController } from './editor/editor.controller'
import { AiEditorSessionsService } from './editor/sessions.service'

// models
import { AiDefaultModelsService } from './models/defaults.service'
import { AiModelItemsService } from './models/items.service'
import { AiModelResolverService } from './models/resolver.service'
import { AiModelServicesService } from './models/services.service'
import { AiSystemAdminController } from './models/system-admin.controller'
import { AiUserController } from './models/user.controller'

// providers
import { AiProviderAdaptersService } from './providers/adapters.service'
import { AiTemplateController } from './providers/templates.controller'
import { AiProviderTemplatesService } from './providers/templates.service'

@Module({
  imports: [AgentModule, DocumentsModule],
  controllers: [
    AiTemplateController,
    AiSystemAdminController,
    AiUserController,
    AiEditorController,
    AiEditorAgentInternalController,
  ],
  providers: [
    AiProviderTemplatesService,
    AiProviderAdaptersService,
    AiModelServicesService,
    AiModelItemsService,
    AiDefaultModelsService,
    AiModelResolverService,
    AiEditorSessionsService,
  ],
  exports: [
    AiDefaultModelsService,
    AiProviderAdaptersService,
    AiModelResolverService,
    AiEditorSessionsService,
  ],
})
export class AiModule {}
