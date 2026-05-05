import type { FastifyServerOptions } from 'fastify'
import type { CollabConfig } from '../config/runtime-config'

export function createCollabFastifyLoggerOptions(logger: CollabConfig['logger']): NonNullable<FastifyServerOptions['logger']> {
  return {
    level: logger.level,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["set-cookie"]',
        'req.headers["x-api-key"]',
      ],
      censor: '[Redacted]',
    },
    serializers: {
      req: request => ({
        method: request.method,
        url: redactCollabTicketFromUrl(request.url),
        host: request.headers.host,
        remoteAddress: request.raw.socket?.remoteAddress,
        remotePort: request.raw.socket?.remotePort,
      }),
      res: response => ({
        statusCode: response.statusCode,
      }),
    },
    transport: logger.pretty
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            singleLine: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
            ignore: 'pid,hostname,req.headers,res.headers,responseTime',
          },
        }
      : undefined,
  }
}

export function redactCollabTicketFromUrl(url: string): string {
  const parsedUrl = new URL(url, 'http://samepage.local')

  if (parsedUrl.searchParams.has('ticket')) {
    parsedUrl.searchParams.set('ticket', '[Redacted]')
  }

  return `${parsedUrl.pathname}${parsedUrl.search}`
}
