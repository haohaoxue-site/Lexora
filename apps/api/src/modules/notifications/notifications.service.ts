import type {
  DocumentCollaborationUserInviteNotification,
  NotificationSummary,
} from '@haohaoxue/samepage-contracts'
import {
  COLLABORATION_RESOLVER_ENTRY_STATUS,
  COLLABORATION_RESOLVER_ENTRY_TYPE,
  DOCUMENT_COLLABORATION_USER_INVITE_STATUS,
} from '@haohaoxue/samepage-contracts'
import { Injectable } from '@nestjs/common'
import { DocumentStatus, Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'

const documentCollaborationUserInviteNotificationSelect = {
  id: true,
  rootDocumentId: true,
  permission: true,
  scope: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  rootDocument: {
    select: {
      title: true,
    },
  },
  createdByUser: {
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
    },
  },
} satisfies Prisma.DocumentCollaborationUserInviteSelect

type PersistedDocumentCollaborationUserInviteNotification = Prisma.DocumentCollaborationUserInviteGetPayload<{
  select: typeof documentCollaborationUserInviteNotificationSelect
}>

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getNotificationSummary(userId: string): Promise<NotificationSummary> {
    const pendingDocumentCollaborationUserInvites = await this.prisma.documentCollaborationUserInvite.findMany({
      where: {
        inviteeUserId: userId,
        status: DOCUMENT_COLLABORATION_USER_INVITE_STATUS.PENDING,
        rootDocument: {
          status: {
            in: [DocumentStatus.ACTIVE, DocumentStatus.LOCKED],
          },
          trashedAt: null,
        },
      },
      select: documentCollaborationUserInviteNotificationSelect,
      orderBy: [
        { updatedAt: 'desc' },
        { createdAt: 'desc' },
      ],
    })
    const resolverCodeByInviteId = await this.loadResolverCodes(
      pendingDocumentCollaborationUserInvites.map(invitation => invitation.id),
    )

    return {
      pendingDocumentCollaborationUserInviteCount: pendingDocumentCollaborationUserInvites.length,
      pendingDocumentCollaborationUserInvites: pendingDocumentCollaborationUserInvites.map(invitation =>
        mapDocumentCollaborationUserInviteNotification(invitation, resolverCodeByInviteId.get(invitation.id) ?? ''),
      ),
    }
  }

  private async loadResolverCodes(inviteIds: string[]): Promise<Map<string, string>> {
    if (inviteIds.length === 0) {
      return new Map()
    }

    const resolverEntries = await this.prisma.collaborationResolverEntry.findMany({
      where: {
        type: COLLABORATION_RESOLVER_ENTRY_TYPE.DOCUMENT_USER_INVITE,
        targetId: {
          in: inviteIds,
        },
        status: COLLABORATION_RESOLVER_ENTRY_STATUS.ACTIVE,
      },
      select: {
        targetId: true,
        code: true,
      },
    })

    return new Map(resolverEntries.map(entry => [entry.targetId, entry.code]))
  }
}

function mapDocumentCollaborationUserInviteNotification(
  invitation: PersistedDocumentCollaborationUserInviteNotification,
  resolverCode: string,
): DocumentCollaborationUserInviteNotification {
  return {
    id: invitation.id,
    rootDocumentId: invitation.rootDocumentId,
    resolverCode,
    documentTitle: invitation.rootDocument.title,
    inviter: toAuditUserSummary(invitation.createdByUser),
    permission: invitation.permission as DocumentCollaborationUserInviteNotification['permission'],
    scope: invitation.scope as DocumentCollaborationUserInviteNotification['scope'],
    status: invitation.status as DocumentCollaborationUserInviteNotification['status'],
    createdAt: invitation.createdAt.toISOString(),
    updatedAt: invitation.updatedAt.toISOString(),
  }
}

function toAuditUserSummary(user: { id: string, displayName: string | null, avatarUrl: string | null } | null) {
  return user
    ? {
        id: user.id,
        displayName: user.displayName ?? '用户',
        avatarUrl: user.avatarUrl,
      }
    : null
}
