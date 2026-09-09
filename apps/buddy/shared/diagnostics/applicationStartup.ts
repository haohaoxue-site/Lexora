export interface ApplicationStartupState {
  revision: number
  generation: string | null
  hasBeenReady: boolean
  status: 'starting' | 'failed' | 'ready' | 'stopping' | 'stopped'
  stages: ReadonlyArray<{
    stage: string
    status: 'pending' | 'running' | 'completed' | 'failed' | 'stopping' | 'stopped'
    operationId?: string
    durationMs?: number
    errorCode?: string
  }>
}
