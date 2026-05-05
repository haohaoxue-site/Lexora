import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'

interface ErrorResponseBody {
  code?: number
  message?: string | string[]
}

interface ApiErrorResponse {
  code: number
  message: string
  data: null
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<FastifyReply>()

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      response
        .status(status)
        .send(this.normalizeHttpError(status, exception.getResponse()))
      return
    }

    this.logger.error(
      exception instanceof Error ? exception.message : 'Unknown error',
      exception instanceof Error ? exception.stack : undefined,
    )

    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .send(this.buildErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR, 'Internal server error'))
  }

  private normalizeHttpError(status: number, response: string | object): ApiErrorResponse {
    if (typeof response === 'string') {
      return this.buildErrorResponse(status, response)
    }

    const body = response as ErrorResponseBody

    return this.buildErrorResponse(
      body.code ?? status,
      this.resolveMessage(body.message),
    )
  }

  private resolveMessage(message: string | string[] | undefined): string {
    if (Array.isArray(message)) {
      return message.join(', ')
    }

    return message ?? 'Unexpected error'
  }

  private buildErrorResponse(code: number, message: string): ApiErrorResponse {
    return {
      code,
      message,
      data: null,
    }
  }
}
