import { registerAs } from '@nestjs/config'

const DEFAULT_COLLAB_PUBLIC_WS_URL = '/collab'
const DEFAULT_COLLAB_TICKET_TTL_SECONDS = 120

export interface CollabConfig {
  publicWsUrl: string
  ticketTtlSeconds: number
}

export const collabConfig = registerAs('collab', (): CollabConfig => ({
  publicWsUrl: DEFAULT_COLLAB_PUBLIC_WS_URL,
  ticketTtlSeconds: DEFAULT_COLLAB_TICKET_TTL_SECONDS,
}))
