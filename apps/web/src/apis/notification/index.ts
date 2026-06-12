import type {
  CreatePlatformNotificationRequest,
  GetPlatformNotificationsQuery,
  NotificationListQuery,
  NotificationListResponse,
  NotificationMarkAllReadResponse,
  NotificationSummary,
  PlatformNotification,
  PlatformNotificationListResponse,
  UpdatePlatformNotificationRequest,
} from './typing'
import { axios } from '@/utils/axios'

export * from './typing'

export function listNotifications(params: NotificationListQuery): Promise<NotificationListResponse> {
  return axios.request({
    method: 'get',
    url: '/notifications',
    params,
  })
}

export function getNotificationSummary(): Promise<NotificationSummary> {
  return axios.request({
    method: 'get',
    url: '/notifications/summary',
  })
}

export function markAllNotificationsRead(): Promise<NotificationMarkAllReadResponse> {
  return axios.request({
    method: 'patch',
    url: '/notifications/read-all',
  })
}

export function listPlatformNotifications(params: GetPlatformNotificationsQuery): Promise<PlatformNotificationListResponse> {
  return axios.request({
    method: 'get',
    url: '/system-admin/notifications',
    params,
  })
}

export function createPlatformNotification(data: CreatePlatformNotificationRequest): Promise<PlatformNotification> {
  return axios.request({
    method: 'post',
    url: '/system-admin/notifications',
    data,
  })
}

export function updatePlatformNotification(
  id: string,
  data: UpdatePlatformNotificationRequest,
): Promise<PlatformNotification> {
  return axios.request({
    method: 'patch',
    url: `/system-admin/notifications/${id}`,
    data,
  })
}

export function deletePlatformNotification(id: string): Promise<void> {
  return axios.request({
    method: 'delete',
    url: `/system-admin/notifications/${id}`,
  })
}
