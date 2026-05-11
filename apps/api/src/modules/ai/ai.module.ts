import { Module } from '@nestjs/common'
import { AgentModule } from '../agent/agent.module'
import { DocumentsModule } from '../documents/documents.module'

// editor
import { AiEditorAgentInternalController } from './editor/agent-internal.controller'
import { AiEditorController } from './editor/editor.controller'
import { AiEditorSessionsService } from './editor/sessions.service'

// models
import { AiDefaultModelsService } from './models/defaults.service'
import { AiProviderModelsService } from './models/provider-models.service'
import { AiProvidersService } from './models/providers.service'
import { AiModelResolverService } from './models/resolver.service'
import { AiSystemAdminController } from './models/system-admin.controller'
import { AiUserController } from './models/user.controller'

// providers
import { AiProviderAdaptersService } from './providers/adapters.service'
import { AiProviderPresetsController } from './providers/presets.controller'
import { AiProviderPresetsService } from './providers/presets.service'

@Module({
  imports: [AgentModule, DocumentsModule],
  controllers: [
    AiProviderPresetsController,
    AiSystemAdminController,
    AiUserController,
    AiEditorController,
    AiEditorAgentInternalController,
  ],
  providers: [
    AiProviderPresetsService,
    AiProviderAdaptersService,
    AiProvidersService,
    AiProviderModelsService,
    AiDefaultModelsService,
    AiModelResolverService,
    AiEditorSessionsService,
  ],
  exports: [
    AiDefaultModelsService,
    AiProviderAdaptersService,
    AiProvidersService,
    AiModelResolverService,
    AiEditorSessionsService,
  ],
})
export class AiModule {}
