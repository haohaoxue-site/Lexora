import { Module } from '@nestjs/common'
import { AgentModule } from '../agent/agent.module'
import { AiModule } from '../ai/ai.module'
import { DocumentsModule } from '../documents/documents.module'
import { ChatAgentInternalController } from './chat-agent-internal.controller'
import { ChatContextSnapshotsService } from './chat-context-snapshots.service'
import { ChatRunDispatcherService } from './chat-run-dispatcher.service'
import { ChatRunProjectorService } from './chat-run-projector.service'
import { ChatSessionEventsService } from './chat-session-events.service'
import { ChatSessionsService } from './chat-sessions.service'
import { ChatController } from './chat.controller'
import { ChatService } from './chat.service'

@Module({
  imports: [AgentModule, AiModule, DocumentsModule],
  controllers: [ChatController, ChatAgentInternalController],
  providers: [
    ChatService,
    ChatSessionsService,
    ChatContextSnapshotsService,
    ChatSessionEventsService,
    ChatRunDispatcherService,
    ChatRunProjectorService,
  ],
  exports: [ChatService, ChatSessionsService],
})
export class ChatModule {}
