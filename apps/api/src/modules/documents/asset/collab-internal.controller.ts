import type {
  ConsumeCollabTicketRequest,
  MaterializeDocumentYdocCurrentProjectionRequest,
  MaterializeDocumentYdocCurrentProjectionResponse,
} from '@haohaoxue/samepage-contracts'
import type { FastifyReply } from 'fastify'
import {
  ConsumeCollabTicketRequestSchema,
  MaterializeDocumentYdocCurrentProjectionSchema,
} from '@haohaoxue/samepage-contracts'
import { Body, Controller, Param, Post, Res } from '@nestjs/common'
import { Public } from '../../../decorators/public.decorator'
import { ZodValidationPipe } from '../../../pipes/zod-validation.pipe'
import { DocumentContentService } from '../content/content.service'
import {
  DocumentCollabTicketConsumeError,
  DocumentCollabTicketsService,
} from './collab-ticket.service'

@Controller('internal/documents')
export class DocumentCollabInternalController {
  constructor(
    private readonly documentContentService: DocumentContentService,
    private readonly documentCollabTicketsService: DocumentCollabTicketsService,
  ) {}

  @Public()
  @Post(':id/ydoc-current-projections')
  async materializeDocumentYdocCurrentProjection(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(MaterializeDocumentYdocCurrentProjectionSchema)) payload: MaterializeDocumentYdocCurrentProjectionRequest,
  ): Promise<MaterializeDocumentYdocCurrentProjectionResponse> {
    return this.documentContentService.materializeDocumentYdocCurrentProjection(id, payload)
  }

  @Public()
  @Post(':id/collab-ticket-consumptions')
  async consumeDocumentCollabTicket(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ConsumeCollabTicketRequestSchema)) payload: ConsumeCollabTicketRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    try {
      reply.send(await this.documentCollabTicketsService.consumeDocumentCollabTicket(id, payload.token))
    }
    catch (error) {
      if (error instanceof DocumentCollabTicketConsumeError) {
        reply.code(401).send({ code: error.code })
        return
      }

      throw error
    }
  }
}
