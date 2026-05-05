import { Module } from '@nestjs/common'
import { AgentModule } from '../agent/agent.module'
import { AiModule } from '../ai/ai.module'
import { ChatAgentInternalController } from './chat-agent-internal.controller'
import { ChatSessionsService } from './chat-sessions.service'
import { ChatController } from './chat.controller'
import { ChatService } from './chat.service'

@Module({
  imports: [AgentModule, AiModule],
  controllers: [ChatController, ChatAgentInternalController],
  providers: [ChatService, ChatSessionsService],
})
export class ChatModule {}
