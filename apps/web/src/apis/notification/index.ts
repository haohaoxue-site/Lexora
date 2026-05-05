import type { NotificationSummary } from './typing'
import { axios } from '@/utils/axios'

export * from './typing'

export function getNotificationSummary(): Promise<NotificationSummary> {
  return axios.request({
    method: 'get',
    url: '/notifications/summary',
  })
}
