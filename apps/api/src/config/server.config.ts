import process from 'node:process'
import { SERVER_PATH, SERVER_PORT } from '@haohaoxue/samepage-contracts'
import { registerAs } from '@nestjs/config'

const LEADING_OR_TRAILING_SLASHES_RE = /^\/+|\/+$/g

export const serverConfig = registerAs('server', () => ({
  port: SERVER_PORT,
  apiPrefix: SERVER_PATH.replace(LEADING_OR_TRAILING_SLASHES_RE, ''),
  isProduction: process.env.NODE_ENV === 'production',
}))
