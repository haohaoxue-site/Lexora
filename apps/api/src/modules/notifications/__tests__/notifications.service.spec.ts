import {
  DOCUMENT_COLLABORATION_PERMISSION,
  DOCUMENT_COLLABORATION_SCOPE,
  DOCUMENT_COLLABORATION_USER_INVITE_STATUS,
  NOTIFICATION_LIST_FILTER,
  NOTIFICATION_SOURCE_KIND,
  PLATFORM_NOTIFICATION_STATUS,
} from '@haohaoxue/samepage-contracts'
import { describe, expect, it, vi } from 'vitest'
import { NotificationsService } from '../notifications.service'

const platformContent = [{
  type: 'paragraph',
  content: [{ type: 'text', text: '平台升级将在今晚完成。' }],
}]
const platformPublishedAt = new Date('2026-06-12T10:00:00.000Z')
const inviteCreatedAt = new Date('2026-06-12T11:00:00.000Z')

function getSqlText(query: unknown): string {
  if (
    typeof query === 'object'
    && query !== null
    && 'strings' in query
    && Array.isArray((query as { strings: unknown }).strings)
  ) {
    return (query as { strings: string[] }).strings.join(' ')
  }

  return String(query)
}

function createPrismaMock() {
  const notificationReadReceipt = {
    findMany: vi.fn().mockResolvedValue([]),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
  }

  const prisma = {
    $transaction: vi.fn(),
    $queryRaw: vi.fn().mockImplementation((query: unknown) => {
      const sqlText = getSqlText(query)

      if (sqlText.includes('COUNT(*)') && sqlText.includes('"PlatformNotification"')) {
        return Promise.resolve([{ count: 1 }])
      }

      if (sqlText.includes('COUNT(*)') && sqlText.includes('"DocumentCollaborationUserInvite"')) {
        return Promise.resolve([{ count: 1 }])
      }

      if (sqlText.includes('SELECT pn."id"')) {
        return Promise.resolve([{ id: 'platform-1', messageAt: platformPublishedAt }])
      }

      if (sqlText.includes('SELECT invitation."id"')) {
        return Promise.resolve([{ id: 'invite-1', messageAt: inviteCreatedAt }])
      }

      return Promise.resolve([])
    }),
    platformNotification: {
      create: vi.fn().mockResolvedValue({
        id: 'platform-1',
        title: '平台升级通知',
        content: platformContent,
        summary: '平台升级将在今晚完成。',
        status: 'DRAFT',
        publishedAt: null,
        createdAt: new Date('2026-06-12T09:00:00.000Z'),
        createdBy: 'admin-1',
        createdByUser: null,
        updatedAt: new Date('2026-06-12T09:00:00.000Z'),
        updatedBy: 'admin-1',
        updatedByUser: null,
      }),
      findUnique: vi.fn().mockResolvedValue({
        id: 'platform-1',
        status: 'DRAFT',
        publishedAt: null,
      }),
      findMany: vi.fn().mockResolvedValue([{
        id: 'platform-1',
        title: '平台升级通知',
        content: platformContent,
        summary: '平台升级将在今晚完成。',
        status: 'PUBLISHED',
        publishedAt: platformPublishedAt,
        createdAt: new Date('2026-06-12T09:00:00.000Z'),
        createdBy: 'admin-1',
        createdByUser: {
          id: 'admin-1',
          displayName: 'SamePage',
          avatarUrl: '/api/users/avatar/admin-1?v=1',
        },
        updatedAt: platformPublishedAt,
        updatedBy: 'admin-1',
        updatedByUser: {
          id: 'admin-1',
          displayName: '管理员',
          avatarUrl: null,
        },
      }]),
      update: vi.fn().mockResolvedValue({
        id: 'platform-1',
        title: '平台升级通知',
        content: platformContent,
        summary: '平台升级将在今晚完成。',
        status: 'DRAFT',
        publishedAt: null,
        createdAt: new Date('2026-06-12T09:00:00.000Z'),
        createdBy: 'admin-1',
        createdByUser: null,
        updatedAt: new Date('2026-06-12T10:00:00.000Z'),
        updatedBy: 'admin-1',
        updatedByUser: null,
      }),
      delete: vi.fn().mockResolvedValue({
        id: 'platform-1',
      }),
    },
    documentCollaborationUserInvite: {
      findMany: vi.fn().mockResolvedValue([{
        id: 'invite-1',
        rootDocumentId: 'doc-1',
        permission: DOCUMENT_COLLABORATION_PERMISSION.READ,
        scope: DOCUMENT_COLLABORATION_SCOPE.SELF,
        status: DOCUMENT_COLLABORATION_USER_INVITE_STATUS.PENDING,
        createdAt: inviteCreatedAt,
        updatedAt: inviteCreatedAt,
        rootDocument: {
          title: '协作文档',
        },
        createdByUser: {
          id: 'user-2',
          displayName: '邀请人',
          avatarUrl: 'https://example.com/avatar.png',
        },
      }]),
    },
    collaborationResolverEntry: {
      findMany: vi.fn().mockResolvedValue([{
        targetId: 'invite-1',
        code: 'resolver-code',
      }]),
    },
    notificationReadReceipt,
    $bypass: {
      notificationReadReceipt,
    },
  }
  prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma))

  return prisma
}

function createNotificationAssetsMock() {
  return {
    assertAssetsCanBeAttached: vi.fn().mockResolvedValue(undefined),
    attachAssetsToNotification: vi.fn().mockResolvedValue(undefined),
  }
}

describe('notificationsService message list', () => {
  it('lists unread platform messages and collaboration invites in one timeline', async () => {
    const prisma = createPrismaMock()
    const service = new NotificationsService(prisma as never, createNotificationAssetsMock() as never)

    const response = await service.listNotifications('user-1', {
      filter: NOTIFICATION_LIST_FILTER.UNREAD,
      limit: 20,
    })

    expect(response.unreadCount).toBe(2)
    expect(prisma.notificationReadReceipt.findMany).not.toHaveBeenCalled()
    expect(response.items.map(item => item.kind)).toEqual([
      NOTIFICATION_SOURCE_KIND.DOCUMENT_COLLABORATION_USER_INVITE,
      NOTIFICATION_SOURCE_KIND.PLATFORM,
    ])
    expect(response.items[0]).toMatchObject({
      kind: NOTIFICATION_SOURCE_KIND.DOCUMENT_COLLABORATION_USER_INVITE,
      sender: {
        displayName: '邀请人',
        avatarUrl: 'https://example.com/avatar.png',
      },
      title: '邀请你协作《协作文档》',
      isUnread: true,
    })
    expect(response.items[1]).toMatchObject({
      kind: NOTIFICATION_SOURCE_KIND.PLATFORM,
      sender: {
        displayName: 'SamePage',
        avatarUrl: '/api/users/avatar/admin-1?v=1',
      },
      title: '平台升级通知',
      contentText: '平台升级将在今晚完成。',
      isUnread: true,
    })
  })

  it('marks all unread platform messages and collaboration invites as read', async () => {
    const prisma = createPrismaMock()
    const service = new NotificationsService(prisma as never, createNotificationAssetsMock() as never)

    const response = await service.markAllAsRead('user-1')

    expect(response.markedCount).toBe(2)
    expect(prisma.notificationReadReceipt.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          userId: 'user-1',
          sourceKind: NOTIFICATION_SOURCE_KIND.PLATFORM,
          sourceId: 'platform-1',
        }),
        expect.objectContaining({
          userId: 'user-1',
          sourceKind: NOTIFICATION_SOURCE_KIND.DOCUMENT_COLLABORATION_USER_INVITE,
          sourceId: 'invite-1',
        }),
      ]),
      skipDuplicates: true,
    })
  })

  it('uses the last rendered item as cursor for dynamic loading', async () => {
    const prisma = createPrismaMock()
    prisma.documentCollaborationUserInvite.findMany.mockResolvedValue([])
    const newNotification = {
      id: 'platform-new',
      title: '新消息',
      content: platformContent,
      summary: '新消息内容',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-06-12T10:00:00.000Z'),
      createdAt: new Date('2026-06-12T10:00:00.000Z'),
      createdBy: 'admin-1',
      createdByUser: null,
      updatedAt: new Date('2026-06-12T10:00:00.000Z'),
      updatedBy: 'admin-1',
      updatedByUser: null,
    }
    const oldNotification = {
      id: 'platform-old',
      title: '旧消息',
      content: platformContent,
      summary: '旧消息内容',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-06-12T09:00:00.000Z'),
      createdAt: new Date('2026-06-12T09:00:00.000Z'),
      createdBy: 'admin-1',
      createdByUser: null,
      updatedAt: new Date('2026-06-12T09:00:00.000Z'),
      updatedBy: 'admin-1',
      updatedByUser: null,
    }

    prisma.platformNotification.findMany
      .mockResolvedValueOnce([newNotification, oldNotification])
      .mockResolvedValueOnce([oldNotification])
    const service = new NotificationsService(prisma as never, createNotificationAssetsMock() as never)

    const firstPage = await service.listNotifications('user-1', {
      filter: NOTIFICATION_LIST_FILTER.ALL,
      limit: 1,
    })
    const secondPage = await service.listNotifications('user-1', {
      filter: NOTIFICATION_LIST_FILTER.ALL,
      limit: 1,
      cursor: firstPage.nextCursor ?? undefined,
    })

    expect(firstPage.items.map(item => item.sourceId)).toEqual(['platform-new'])
    expect(firstPage.nextCursor).toBeTruthy()
    expect(secondPage.items.map(item => item.sourceId)).toEqual(['platform-old'])
    expect(prisma.platformNotification.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      take: 2,
    }))
  })

  it('rejects editing published platform notifications', async () => {
    const prisma = createPrismaMock()
    prisma.platformNotification.findUnique.mockResolvedValue({
      id: 'platform-1',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-06-12T10:00:00.000Z'),
    })
    const service = new NotificationsService(prisma as never, createNotificationAssetsMock() as never)

    await expect(service.updatePlatformNotification('admin-1', 'platform-1', {
      title: '更新标题',
    })).rejects.toThrow('已发布站内信不可编辑')
    expect(prisma.platformNotification.update).not.toHaveBeenCalled()
  })

  it('creates platform notifications and attaches referenced image assets in one transaction', async () => {
    const prisma = createPrismaMock()
    const notificationAssets = createNotificationAssetsMock()
    const service = new NotificationsService(prisma as never, notificationAssets as never)

    await service.createPlatformNotification('admin-1', {
      title: '平台升级通知',
      content: [{
        type: 'image',
        attrs: {
          assetId: 'asset-1',
        },
      }],
      status: PLATFORM_NOTIFICATION_STATUS.DRAFT,
    })

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(notificationAssets.assertAssetsCanBeAttached).toHaveBeenCalledWith({
      assetIds: ['asset-1'],
    }, prisma)
    expect(notificationAssets.attachAssetsToNotification).toHaveBeenCalledWith({
      notificationId: 'platform-1',
      assetIds: ['asset-1'],
    }, prisma)
  })

  it('updates platform notification content and asset bindings in one transaction', async () => {
    const prisma = createPrismaMock()
    const notificationAssets = createNotificationAssetsMock()
    const service = new NotificationsService(prisma as never, notificationAssets as never)

    await service.updatePlatformNotification('admin-1', 'platform-1', {
      content: [{
        type: 'image',
        attrs: {
          assetId: 'asset-1',
        },
      }],
    })

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(notificationAssets.assertAssetsCanBeAttached).toHaveBeenCalledWith({
      notificationId: 'platform-1',
      assetIds: ['asset-1'],
    }, prisma)
    expect(notificationAssets.attachAssetsToNotification).toHaveBeenCalledWith({
      notificationId: 'platform-1',
      assetIds: ['asset-1'],
    }, prisma)
  })

  it('records the deleting actor when deleting platform notifications', async () => {
    const prisma = createPrismaMock()
    const service = new NotificationsService(prisma as never, createNotificationAssetsMock() as never)

    await service.deletePlatformNotification('admin-1', 'platform-1')

    expect(prisma.platformNotification.update).toHaveBeenCalledWith({
      where: { id: 'platform-1' },
      data: {
        deletedAt: expect.any(Date),
        deletedBy: 'admin-1',
      },
    })
  })
})
