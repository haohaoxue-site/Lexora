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

interface HttpLikeException {
  statusCode?: unknown
  status?: unknown
  message?: unknown
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

    const status = this.resolveHttpLikeClientErrorStatus(exception)

    if (status !== null) {
      response
        .status(status)
        .send(this.buildErrorResponse(status, this.resolveUnknownErrorMessage(exception)))
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

  private resolveHttpLikeClientErrorStatus(exception: unknown): number | null {
    if (!exception || typeof exception !== 'object') {
      return null
    }

    const error = exception as HttpLikeException
    const status = typeof error.statusCode === 'number'
      ? error.statusCode
      : typeof error.status === 'number'
        ? error.status
        : null

    if (!status || status < 400 || status > 499) {
      return null
    }

    return status
  }

  private resolveUnknownErrorMessage(exception: unknown): string {
    if (exception instanceof Error && exception.message) {
      return exception.message
    }

    if (exception && typeof exception === 'object') {
      const error = exception as HttpLikeException

      if (typeof error.message === 'string' && error.message) {
        return error.message
      }
    }

    return 'Unexpected error'
  }
}
