import type { FastifyInstance } from 'fastify'
import type { CollabMetricsCollector } from '../../observability/metrics'

export function registerMetricsRoutes(app: FastifyInstance, metrics: CollabMetricsCollector): void {
  app.get('/metrics', async () => metrics.getSnapshot())
}
