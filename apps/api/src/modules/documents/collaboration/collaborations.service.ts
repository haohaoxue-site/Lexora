import type {
  ConfirmDocumentCollaborationResolverEntryRequest,
  CreateDocumentCollaborationUserInviteRequest,
  DocumentCollaborationConsoleListResponse,
  DocumentCollaborationCurrentAccessSummary,
  DocumentCollaborationGrant,
  DocumentCollaborationGrantSourceType,
  DocumentCollaborationJoinResponse,
  DocumentCollaborationLinkInvite,
  DocumentCollaborationOverview,
  DocumentCollaborationPermission,
  DocumentCollaborationResolverPreview,
  DocumentCollaborationScope,
  DocumentCollaborationUserInvite,
  SetDocumentCollaborationUserGrantRequest,
  UpdateDocumentCollaborationGrantRequest,
  UpsertDocumentCollaborationLinkInviteRequest,
  UpsertDocumentCollaborationLinkInviteResponse,
} from '@haohaoxue/lexora-contracts'
import { randomBytes } from 'node:crypto'
import {
  COLLAB_PERMISSION_INVALIDATION_REASON,
  COLLABORATION_RESOLVER_ENTRY_STATUS,
  COLLABORATION_RESOLVER_ENTRY_TYPE,
  DOCUMENT_COLLABORATION_COLLABORATOR_SOURCE,
  DOCUMENT_COLLABORATION_GRANT_SOURCE_TYPE,
  DOCUMENT_COLLABORATION_GRANT_STATUS,
  DOCUMENT_COLLABORATION_LINK_INVITE_STATE,
  DOCUMENT_COLLABORATION_PERMISSION,
  DOCUMENT_COLLABORATION_RANGE_SUMMARY,
  DOCUMENT_COLLABORATION_RESOLVER_STATUS,
  DOCUMENT_COLLABORATION_SCOPE,
  DOCUMENT_COLLABORATION_USER_INVITE_STATUS,
  DOCUMENT_VISIBILITY,
} from '@haohaoxue/lexora-contracts'
import { isExactUserCodeQuery, normalizeUserCodeQuery } from '@haohaoxue/lexora-shared'
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { DocumentStatus, Prisma } from '@prisma/client'
import { PrismaService } from '../../../database/prisma.service'
import { CollabPermissionInvalidationPublisherService } from '../../../infrastructure/publisher/collab-permission-invalidation-publisher.service'
import { DocumentAccessService } from '../core/access.service'
import { hashCollaborationPassword, verifyCollaborationPassword } from './collaboration-password'

const userCollabIdentitySelect = {
  id: true,
  email: true,
  displayName: true,
  avatarUrl: true,
  userCode: true,
} satisfies Prisma.UserSelect

const auditUserSummarySelect = {
  id: true,
  displayName: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect

const collaborationGrantSelect = {
  id: true,
  rootDocumentId: true,
  userId: true,
  user: {
    select: userCollabIdentitySelect,
  },
  permission: true,
  scope: true,
  sourceType: true,
  sourceId: true,
  status: true,
  createdAt: true,
  createdBy: true,
  updatedAt: true,
  updatedBy: true,
} satisfies Prisma.DocumentCollaborationGrantSelect

const collaborationUserInviteSelect = {
  id: true,
  rootDocumentId: true,
  inviteeUserId: true,
  inviteeUser: {
    select: userCollabIdentitySelect,
  },
  permission: true,
  scope: true,
  status: true,
  createdAt: true,
  createdBy: true,
  updatedAt: true,
  updatedBy: true,
} satisfies Prisma.DocumentCollaborationUserInviteSelect

const collaborationLinkInviteSelect = {
  id: true,
  rootDocumentId: true,
  permission: true,
  scope: true,
  enabled: true,
  passwordEnabled: true,
  passwordHash: true,
  passwordCode: true,
  createdAt: true,
  createdBy: true,
  updatedAt: true,
  updatedBy: true,
} satisfies Prisma.DocumentCollaborationLinkInviteSelect

const resolverEntrySelect = {
  code: true,
  type: true,
  targetId: true,
  status: true,
} satisfies Prisma.CollaborationResolverEntrySelect

const userInviteResolverSelect = {
  id: true,
  rootDocumentId: true,
  inviteeUserId: true,
  permission: true,
  scope: true,
  status: true,
  rootDocument: {
    select: {
      id: true,
      title: true,
      status: true,
      trashedAt: true,
    },
  },
  createdByUser: {
    select: auditUserSummarySelect,
  },
} satisfies Prisma.DocumentCollaborationUserInviteSelect

const linkInviteResolverSelect = {
  id: true,
  rootDocumentId: true,
  permission: true,
  scope: true,
  enabled: true,
  passwordEnabled: true,
  passwordHash: true,
  passwordCode: true,
  rootDocument: {
    select: {
      id: true,
      title: true,
      status: true,
      trashedAt: true,
    },
  },
  createdByUser: {
    select: auditUserSummarySelect,
  },
} satisfies Prisma.DocumentCollaborationLinkInviteSelect

const collaborationRootDocumentSelect = {
  id: true,
  title: true,
  parentId: true,
  createdBy: true,
  createdByUser: {
    select: auditUserSummarySelect,
  },
} satisfies Prisma.DocumentSelect

const collaborationConsoleDocumentSelect = {
  id: true,
  title: true,
  parentId: true,
  order: true,
  updatedAt: true,
  collaborationGrants: {
    where: {
      status: DOCUMENT_COLLABORATION_GRANT_STATUS.ACTIVE,
    },
    select: {
      id: true,
      scope: true,
      updatedAt: true,
    },
  },
  collaborationUserInvites: {
    where: {
      status: DOCUMENT_COLLABORATION_USER_INVITE_STATUS.PENDING,
    },
    select: {
      id: true,
      scope: true,
      updatedAt: true,
    },
  },
  collaborationLinkInvite: {
    select: {
      id: true,
      permission: true,
      enabled: true,
      scope: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.DocumentSelect

type PersistedCollaborationGrant = Prisma.DocumentCollaborationGrantGetPayload<{ select: typeof collaborationGrantSelect }>
type PersistedCollaborationUserInvite = Prisma.DocumentCollaborationUserInviteGetPayload<{ select: typeof collaborationUserInviteSelect }>
type PersistedCollaborationLinkInvite = Prisma.DocumentCollaborationLinkInviteGetPayload<{ select: typeof collaborationLinkInviteSelect }>
type PersistedResolverEntry = Prisma.CollaborationResolverEntryGetPayload<{ select: typeof resolverEntrySelect }>
type PersistedUserInviteResolver = Prisma.DocumentCollaborationUserInviteGetPayload<{ select: typeof userInviteResolverSelect }>
type PersistedLinkInviteResolver = Prisma.DocumentCollaborationLinkInviteGetPayload<{ select: typeof linkInviteResolverSelect }>
type PersistedCollaborationRootDocument = Prisma.DocumentGetPayload<{ select: typeof collaborationRootDocumentSelect }>
type PersistedCollaborationConsoleDocument = Prisma.DocumentGetPayload<{ select: typeof collaborationConsoleDocumentSelect }>

interface EntryGrantInput {
  rootDocumentId: string
  permission: DocumentCollaborationPermission
  scope: DocumentCollaborationScope
  sourceType: DocumentCollaborationGrantSourceType
  sourceId: string | null
  actorUserId: string
}

interface DocumentAncestor {
  id: string
  title: string
  parentId: string | null
}

interface ActiveResolverEntry {
  code: string
  type: typeof COLLABORATION_RESOLVER_ENTRY_TYPE.DOCUMENT_USER_INVITE | typeof COLLABORATION_RESOLVER_ENTRY_TYPE.DOCUMENT_LINK_INVITE
  targetId: string
}

interface ResolverEntryCreateInput {
  type: ActiveResolverEntry['type']
  targetId: string
}

@Injectable()
export class DocumentCollaborationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentAccessService: DocumentAccessService,
    private readonly collabPermissionInvalidationPublisher: CollabPermissionInvalidationPublisherService,
  ) {}

  async listManagementTree(userId: string, workspaceId: string): Promise<DocumentCollaborationConsoleListResponse> {
    const workspace = await this.documentAccessService.assertAccessibleWorkspace(userId, workspaceId)
    const documents = await this.prisma.document.findMany({
      where: {
        workspaceId: workspace.id,
        createdBy: userId,
        visibility: DOCUMENT_VISIBILITY.PRIVATE,
        status: {
          in: [DocumentStatus.ACTIVE, DocumentStatus.LOCKED],
        },
        trashedAt: null,
      },
      select: collaborationConsoleDocumentSelect,
      orderBy: [
        { order: 'asc' },
        { updatedAt: 'desc' },
      ],
    })
    const linkCodes = await this.loadResolverCodes(
      COLLABORATION_RESOLVER_ENTRY_TYPE.DOCUMENT_LINK_INVITE,
      documents
        .map(document => document.collaborationLinkInvite?.id)
        .filter((id): id is string => Boolean(id)),
    )

    return {
      tree: buildCollaborationConsoleTree(documents, linkCodes),
    }
  }

  async getOverview(userId: string, documentId: string): Promise<DocumentCollaborationOverview> {
    await this.assertCanManageCollaborations(userId, documentId)
    const rootDocument = await this.loadCollaborationRootDocument(documentId)
    const ancestors = await this.loadAncestorDocuments(rootDocument.parentId)
    const ancestorIds = ancestors.map(ancestor => ancestor.id)
    const [directGrants, inheritedGrants, userInvites, linkInvite] = await Promise.all([
      this.prisma.documentCollaborationGrant.findMany({
        where: {
          rootDocumentId: documentId,
          status: DOCUMENT_COLLABORATION_GRANT_STATUS.ACTIVE,
        },
        select: collaborationGrantSelect,
        orderBy: [
          { updatedAt: 'desc' },
          { id: 'asc' },
        ],
      }),
      ancestorIds.length
        ? this.prisma.documentCollaborationGrant.findMany({
            where: {
              rootDocumentId: {
                in: ancestorIds,
              },
              scope: DOCUMENT_COLLABORATION_SCOPE.DESCENDANTS,
              status: DOCUMENT_COLLABORATION_GRANT_STATUS.ACTIVE,
            },
            select: collaborationGrantSelect,
          })
        : [],
      this.prisma.documentCollaborationUserInvite.findMany({
        where: {
          rootDocumentId: documentId,
          status: DOCUMENT_COLLABORATION_USER_INVITE_STATUS.PENDING,
        },
        select: collaborationUserInviteSelect,
        orderBy: [
          { updatedAt: 'desc' },
          { id: 'asc' },
        ],
      }),
      this.prisma.documentCollaborationLinkInvite.findUnique({
        where: { rootDocumentId: documentId },
        select: collaborationLinkInviteSelect,
      }),
    ])
    const inviteCodes = await this.loadResolverCodes(
      COLLABORATION_RESOLVER_ENTRY_TYPE.DOCUMENT_USER_INVITE,
      userInvites.map(invite => invite.id),
    )
    const linkCodes = linkInvite
      ? await this.loadResolverCodes(COLLABORATION_RESOLVER_ENTRY_TYPE.DOCUMENT_LINK_INVITE, [linkInvite.id])
      : new Map<string, string>()
    const directUserIds = new Set(directGrants.map(grant => grant.userId))
    const nearestInheritedGrantByUserId = resolveNearestInheritedGrantByUserId({
      inheritedGrants,
      ancestors,
    })
    const mappedDirectGrants = directGrants.map(toDocumentCollaborationGrant)
    const mappedInheritedGrants = Array.from(nearestInheritedGrantByUserId.values())
      .filter(grant => !directUserIds.has(grant.userId))
      .map(toDocumentCollaborationGrant)
    const ancestorById = new Map(ancestors.map(ancestor => [ancestor.id, ancestor]))

    return {
      rootDocumentId: documentId,
      owner: toAuditUserSummary(rootDocument.createdByUser)!,
      directGrants: mappedDirectGrants,
      inheritedGrants: mappedInheritedGrants,
      collaborators: [
        ...mappedDirectGrants.map((grant) => {
          const inheritedGrant = nearestInheritedGrantByUserId.get(grant.userId)

          return {
            userId: grant.userId,
            user: grant.user,
            source: DOCUMENT_COLLABORATION_COLLABORATOR_SOURCE.DIRECT,
            grant,
            effectivePermission: grant.permission,
            effectiveScope: grant.scope,
            inheritedFrom: inheritedGrant ? toDocumentCollaborationInheritedSource(inheritedGrant, ancestorById) : null,
            updatedAt: grant.updatedAt,
          }
        }),
        ...mappedInheritedGrants.map((grant) => {
          const inheritedGrant = nearestInheritedGrantByUserId.get(grant.userId)

          return {
            userId: grant.userId,
            user: grant.user,
            source: DOCUMENT_COLLABORATION_COLLABORATOR_SOURCE.INHERITED,
            grant,
            effectivePermission: grant.permission,
            effectiveScope: grant.scope,
            inheritedFrom: inheritedGrant ? toDocumentCollaborationInheritedSource(inheritedGrant, ancestorById) : null,
            updatedAt: grant.updatedAt,
          }
        }),
      ],
      userInvites: userInvites.map(invite => toDocumentCollaborationUserInvite(invite, inviteCodes.get(invite.id) ?? '')),
      linkInvite: linkInvite ? toDocumentCollaborationLinkInvite(linkInvite, linkCodes.get(linkInvite.id) ?? '') : null,
    }
  }

  async createInvitation(
    userId: string,
    documentId: string,
    payload: CreateDocumentCollaborationUserInviteRequest,
  ): Promise<DocumentCollaborationUserInvite> {
    await this.assertCanManageCollaborations(userId, documentId)
    const invitee = await this.findUserByCode(payload.userCode)

    if (invitee.id === userId) {
      throw new BadRequestException('不能邀请自己协作文档')
    }

    const activeGrant = await this.prisma.documentCollaborationGrant.findUnique({
      where: {
        rootDocumentId_userId: {
          rootDocumentId: documentId,
          userId: invitee.id,
        },
      },
      select: {
        id: true,
        status: true,
      },
    })

    if (activeGrant?.status === DOCUMENT_COLLABORATION_GRANT_STATUS.ACTIVE) {
      throw new ConflictException('该用户已经是协作者')
    }

    const invitation = await this.prisma.$transaction(async (tx) => {
      const userInvite = await tx.documentCollaborationUserInvite.upsert({
        where: {
          rootDocumentId_inviteeUserId: {
            rootDocumentId: documentId,
            inviteeUserId: invitee.id,
          },
        },
        create: {
          rootDocumentId: documentId,
          inviteeUserId: invitee.id,
          permission: payload.permission,
          scope: payload.scope,
          status: DOCUMENT_COLLABORATION_USER_INVITE_STATUS.PENDING,
          createdBy: userId,
          updatedBy: userId,
        },
        update: {
          permission: payload.permission,
          scope: payload.scope,
          status: DOCUMENT_COLLABORATION_USER_INVITE_STATUS.PENDING,
          acceptedGrantId: null,
          updatedBy: userId,
        },
        select: collaborationUserInviteSelect,
      })

      const existingResolverEntry = await tx.collaborationResolverEntry.findFirst({
        where: {
          type: COLLABORATION_RESOLVER_ENTRY_TYPE.DOCUMENT_USER_INVITE,
          targetId: userInvite.id,
          status: COLLABORATION_RESOLVER_ENTRY_STATUS.ACTIVE,
        },
        select: {
          code: true,
        },
      })

      if (existingResolverEntry) {
        return { userInvite, resolverCode: existingResolverEntry.code }
      }

      const resolverCode = await this.createResolverEntry(tx, {
        type: COLLABORATION_RESOLVER_ENTRY_TYPE.DOCUMENT_USER_INVITE,
        targetId: userInvite.id,
      })

      return { userInvite, resolverCode }
    })

    return toDocumentCollaborationUserInvite(invitation.userInvite, invitation.resolverCode)
  }

  async resolveInvitee(userId: string, documentId: string, userCode: string) {
    await this.assertCanManageCollaborations(userId, documentId)

    return this.findUserByCode(userCode)
  }

  async upsertLink(
    userId: string,
    documentId: string,
    payload: UpsertDocumentCollaborationLinkInviteRequest,
  ): Promise<UpsertDocumentCollaborationLinkInviteResponse> {
    await this.assertCanManageCollaborations(userId, documentId)
    const shouldUpdatePassword = Object.hasOwn(payload, 'password')
    const nextPassword = payload.password
    const nextPasswordEnabled = typeof payload.passwordEnabled === 'boolean'
      ? payload.passwordEnabled
      : nextPassword ? true : null
    const passwordHash = nextPassword ? await hashCollaborationPassword(nextPassword) : null
    const linkInvite = await this.prisma.$transaction(async (tx) => {
      const link = await tx.documentCollaborationLinkInvite.upsert({
        where: { rootDocumentId: documentId },
        create: {
          rootDocumentId: documentId,
          permission: payload.permission,
          scope: payload.scope,
          enabled: payload.enabled,
          passwordEnabled: nextPasswordEnabled ?? false,
          passwordHash,
          passwordCode: nextPassword ?? null,
          createdBy: userId,
          updatedBy: userId,
        },
        update: {
          permission: payload.permission,
          scope: payload.scope,
          enabled: payload.enabled,
          ...(nextPasswordEnabled !== null
            ? {
                passwordEnabled: nextPasswordEnabled,
              }
            : {}),
          ...(shouldUpdatePassword
            ? {
                passwordHash,
                passwordCode: nextPassword ?? null,
              }
            : {}),
          updatedBy: userId,
        },
        select: collaborationLinkInviteSelect,
      })
      const existingResolverEntry = await tx.collaborationResolverEntry.findFirst({
        where: {
          type: COLLABORATION_RESOLVER_ENTRY_TYPE.DOCUMENT_LINK_INVITE,
          targetId: link.id,
          status: COLLABORATION_RESOLVER_ENTRY_STATUS.ACTIVE,
        },
        select: {
          code: true,
        },
      })

      if (existingResolverEntry) {
        return { link, resolverCode: existingResolverEntry.code }
      }

      const resolverCode = await this.createResolverEntry(tx, {
        type: COLLABORATION_RESOLVER_ENTRY_TYPE.DOCUMENT_LINK_INVITE,
        targetId: link.id,
      })

      return { link, resolverCode }
    })

    return {
      linkInvite: toDocumentCollaborationLinkInvite(linkInvite.link, linkInvite.resolverCode),
      resolverCode: linkInvite.resolverCode,
    }
  }

  async disableLink(userId: string, documentId: string): Promise<null> {
    await this.assertCanManageCollaborations(userId, documentId)
    await this.prisma.documentCollaborationLinkInvite.updateMany({
      where: {
        rootDocumentId: documentId,
      },
      data: {
        enabled: false,
        updatedBy: userId,
      },
    })

    return null
  }

  async resetLink(userId: string, documentId: string): Promise<UpsertDocumentCollaborationLinkInviteResponse> {
    await this.assertCanManageCollaborations(userId, documentId)
    const result = await this.prisma.$transaction(async (tx) => {
      const link = await tx.documentCollaborationLinkInvite.findUnique({
        where: { rootDocumentId: documentId },
        select: collaborationLinkInviteSelect,
      })

      if (!link) {
        throw new NotFoundException('协作链接不存在')
      }

      await tx.collaborationResolverEntry.updateMany({
        where: {
          type: COLLABORATION_RESOLVER_ENTRY_TYPE.DOCUMENT_LINK_INVITE,
          targetId: link.id,
          status: COLLABORATION_RESOLVER_ENTRY_STATUS.ACTIVE,
        },
        data: {
          status: COLLABORATION_RESOLVER_ENTRY_STATUS.REVOKED,
        },
      })

      const resolverCode = await this.createResolverEntry(tx, {
        type: COLLABORATION_RESOLVER_ENTRY_TYPE.DOCUMENT_LINK_INVITE,
        targetId: link.id,
      })

      return { link, resolverCode }
    })

    return {
      linkInvite: toDocumentCollaborationLinkInvite(result.link, result.resolverCode),
      resolverCode: result.resolverCode,
    }
  }

  async upsertGrantFromEntry(userId: string, input: EntryGrantInput): Promise<DocumentCollaborationGrant> {
    let existingGrant = await this.prisma.documentCollaborationGrant.findUnique({
      where: {
        rootDocumentId_userId: {
          rootDocumentId: input.rootDocumentId,
          userId,
        },
      },
      select: collaborationGrantSelect,
    })

    if (!existingGrant) {
      try {
        const grant = await this.prisma.documentCollaborationGrant.create({
          data: {
            rootDocumentId: input.rootDocumentId,
            userId,
            permission: input.permission,
            scope: input.scope,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            status: DOCUMENT_COLLABORATION_GRANT_STATUS.ACTIVE,
            createdBy: input.actorUserId,
            updatedBy: input.actorUserId,
          },
          select: collaborationGrantSelect,
        })

        return toDocumentCollaborationGrant(grant)
      }
      catch (error) {
        if (!isPrismaUniqueConstraintError(error)) {
          throw error
        }

        existingGrant = await this.prisma.documentCollaborationGrant.findUnique({
          where: {
            rootDocumentId_userId: {
              rootDocumentId: input.rootDocumentId,
              userId,
            },
          },
          select: collaborationGrantSelect,
        })

        if (!existingGrant) {
          throw error
        }
      }
    }

    const grant = await this.prisma.documentCollaborationGrant.update({
      where: { id: existingGrant.id },
      data: {
        permission: maxPermission(existingGrant.permission as DocumentCollaborationPermission, input.permission),
        scope: maxScope(existingGrant.scope as DocumentCollaborationScope, input.scope),
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        status: DOCUMENT_COLLABORATION_GRANT_STATUS.ACTIVE,
        updatedBy: input.actorUserId,
      },
      select: collaborationGrantSelect,
    })

    return toDocumentCollaborationGrant(grant)
  }

  async updateGrant(
    userId: string,
    documentId: string,
    grantId: string,
    payload: UpdateDocumentCollaborationGrantRequest,
  ): Promise<DocumentCollaborationGrant> {
    await this.assertCanManageCollaborations(userId, documentId)
    const existingGrant = await this.prisma.documentCollaborationGrant.findFirst({
      where: {
        id: grantId,
        rootDocumentId: documentId,
        status: DOCUMENT_COLLABORATION_GRANT_STATUS.ACTIVE,
      },
      select: collaborationGrantSelect,
    })

    if (!existingGrant) {
      throw new NotFoundException('协作者不存在')
    }

    const grant = await this.prisma.documentCollaborationGrant.update({
      where: { id: existingGrant.id },
      data: {
        ...(payload.permission ? { permission: payload.permission } : {}),
        ...(payload.scope ? { scope: payload.scope } : {}),
        updatedBy: userId,
      },
      select: collaborationGrantSelect,
    })

    await this.publishGrantInvalidation(documentId, existingGrant.userId)

    return toDocumentCollaborationGrant(grant)
  }

  async setUserGrant(
    userId: string,
    documentId: string,
    targetUserId: string,
    payload: SetDocumentCollaborationUserGrantRequest,
  ): Promise<DocumentCollaborationGrant> {
    await this.assertCanManageCollaborations(userId, documentId)
    const rootDocument = await this.loadCollaborationRootDocument(documentId)

    if (targetUserId === rootDocument.createdBy) {
      throw new BadRequestException('文档所有者不需要协作授权')
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    })

    if (!targetUser) {
      throw new NotFoundException('用户不存在')
    }

    const existingGrant = await this.prisma.documentCollaborationGrant.findUnique({
      where: {
        rootDocumentId_userId: {
          rootDocumentId: documentId,
          userId: targetUserId,
        },
      },
      select: collaborationGrantSelect,
    })
    const grant = existingGrant
      ? await this.prisma.documentCollaborationGrant.update({
          where: { id: existingGrant.id },
          data: {
            permission: payload.permission,
            scope: payload.scope,
            ...(existingGrant.status === DOCUMENT_COLLABORATION_GRANT_STATUS.ACTIVE
              ? {}
              : {
                  sourceType: DOCUMENT_COLLABORATION_GRANT_SOURCE_TYPE.MANUAL,
                  sourceId: null,
                }),
            status: DOCUMENT_COLLABORATION_GRANT_STATUS.ACTIVE,
            updatedBy: userId,
          },
          select: collaborationGrantSelect,
        })
      : await this.prisma.documentCollaborationGrant.create({
          data: {
            rootDocumentId: documentId,
            userId: targetUserId,
            permission: payload.permission,
            scope: payload.scope,
            sourceType: DOCUMENT_COLLABORATION_GRANT_SOURCE_TYPE.MANUAL,
            sourceId: null,
            status: DOCUMENT_COLLABORATION_GRANT_STATUS.ACTIVE,
            createdBy: userId,
            updatedBy: userId,
          },
          select: collaborationGrantSelect,
        })

    await this.publishGrantInvalidation(documentId, targetUserId)

    return toDocumentCollaborationGrant(grant)
  }

  async removeGrant(userId: string, documentId: string, grantId: string): Promise<null> {
    await this.assertCanManageCollaborations(userId, documentId)
    const removedGrant = await this.prisma.$transaction(async (tx) => {
      const grant = await tx.documentCollaborationGrant.findFirst({
        where: {
          id: grantId,
          rootDocumentId: documentId,
          status: DOCUMENT_COLLABORATION_GRANT_STATUS.ACTIVE,
        },
        select: {
          userId: true,
        },
      })

      if (!grant) {
        return null
      }

      await tx.documentCollaborationGrant.update({
        where: {
          id: grantId,
        },
        data: {
          status: DOCUMENT_COLLABORATION_GRANT_STATUS.REMOVED,
          updatedBy: userId,
        },
      })

      return grant
    })

    if (removedGrant) {
      await this.publishGrantInvalidation(documentId, removedGrant.userId)
    }

    return null
  }

  async cancelInvitation(userId: string, documentId: string, invitationId: string): Promise<null> {
    await this.assertCanManageCollaborations(userId, documentId)
    await this.prisma.documentCollaborationUserInvite.updateMany({
      where: {
        id: invitationId,
        rootDocumentId: documentId,
        status: DOCUMENT_COLLABORATION_USER_INVITE_STATUS.PENDING,
      },
      data: {
        status: DOCUMENT_COLLABORATION_USER_INVITE_STATUS.CANCELED,
        updatedBy: userId,
      },
    })

    return null
  }

  async acceptInvitation(userId: string, invitationId: string): Promise<DocumentCollaborationGrant> {
    const invitation = await this.prisma.documentCollaborationUserInvite.findFirst({
      where: {
        id: invitationId,
        inviteeUserId: userId,
        status: DOCUMENT_COLLABORATION_USER_INVITE_STATUS.PENDING,
        rootDocument: {
          status: {
            in: [DocumentStatus.ACTIVE, DocumentStatus.LOCKED],
          },
          trashedAt: null,
        },
      },
      select: {
        id: true,
        rootDocumentId: true,
        inviteeUserId: true,
        permission: true,
        scope: true,
      },
    })

    if (!invitation) {
      throw new NotFoundException('协作邀请不存在或已失效')
    }

    const grant = await this.upsertGrantFromEntry(userId, {
      rootDocumentId: invitation.rootDocumentId,
      permission: invitation.permission as DocumentCollaborationPermission,
      scope: invitation.scope as DocumentCollaborationScope,
      sourceType: DOCUMENT_COLLABORATION_GRANT_SOURCE_TYPE.USER_INVITE,
      sourceId: invitation.id,
      actorUserId: userId,
    })

    await this.prisma.documentCollaborationUserInvite.update({
      where: { id: invitation.id },
      data: {
        status: DOCUMENT_COLLABORATION_USER_INVITE_STATUS.ACCEPTED,
        acceptedGrantId: grant.id,
        updatedBy: userId,
      },
    })

    return grant
  }

  async declineInvitation(userId: string, invitationId: string): Promise<DocumentCollaborationUserInvite> {
    const invitation = await this.prisma.documentCollaborationUserInvite.findFirst({
      where: {
        id: invitationId,
        inviteeUserId: userId,
        status: DOCUMENT_COLLABORATION_USER_INVITE_STATUS.PENDING,
        rootDocument: {
          status: {
            in: [DocumentStatus.ACTIVE, DocumentStatus.LOCKED],
          },
          trashedAt: null,
        },
      },
      select: {
        id: true,
      },
    })

    if (!invitation) {
      throw new NotFoundException('协作邀请不存在或已失效')
    }

    const declinedInvitation = await this.prisma.documentCollaborationUserInvite.update({
      where: { id: invitation.id },
      data: {
        status: DOCUMENT_COLLABORATION_USER_INVITE_STATUS.DECLINED,
        updatedBy: userId,
      },
      select: collaborationUserInviteSelect,
    })

    return toDocumentCollaborationUserInvite(declinedInvitation, '')
  }

  async resolveResolverEntry(code: string, currentUserId: string | null): Promise<DocumentCollaborationResolverPreview> {
    const resolverEntry = await this.loadActiveResolverEntry(code)

    if (resolverEntry.type === COLLABORATION_RESOLVER_ENTRY_TYPE.DOCUMENT_USER_INVITE) {
      return this.resolveUserInviteEntry(resolverEntry, currentUserId)
    }

    return this.resolveLinkInviteEntry(resolverEntry, currentUserId)
  }

  async confirmResolverEntry(
    userId: string,
    code: string,
    payload: ConfirmDocumentCollaborationResolverEntryRequest,
  ): Promise<DocumentCollaborationJoinResponse> {
    const resolverEntry = await this.loadActiveResolverEntry(code)

    if (resolverEntry.type === COLLABORATION_RESOLVER_ENTRY_TYPE.DOCUMENT_USER_INVITE) {
      return this.confirmUserInviteEntry(userId, resolverEntry)
    }

    return this.confirmLinkInviteEntry(userId, resolverEntry, payload)
  }

  private async loadActiveResolverEntry(code: string): Promise<ActiveResolverEntry> {
    const entry = await this.prisma.collaborationResolverEntry.findUnique({
      where: { code },
      select: resolverEntrySelect,
    })

    if (!isActiveResolverEntry(entry)) {
      throw new NotFoundException('协作入口不存在或已失效')
    }

    return {
      code: entry.code,
      type: entry.type,
      targetId: entry.targetId,
    }
  }

  private async resolveUserInviteEntry(
    entry: ActiveResolverEntry,
    currentUserId: string | null,
  ): Promise<DocumentCollaborationResolverPreview> {
    const invite = await this.prisma.documentCollaborationUserInvite.findUnique({
      where: { id: entry.targetId },
      select: userInviteResolverSelect,
    })

    if (!isResolvableUserInvite(invite)) {
      throw new NotFoundException('协作邀请不存在或已失效')
    }

    return {
      code: entry.code,
      type: COLLABORATION_RESOLVER_ENTRY_TYPE.DOCUMENT_USER_INVITE,
      status: invite.status as DocumentCollaborationResolverPreview['status'],
      rootDocumentId: currentUserId ? invite.rootDocumentId : null,
      documentTitle: invite.rootDocument.title,
      inviter: toAuditUserSummary(invite.createdByUser),
      permission: invite.permission as DocumentCollaborationPermission,
      scope: invite.scope as DocumentCollaborationScope,
      passwordRequired: false,
      currentAccess: currentUserId
        ? await this.loadCurrentAccessSummary(invite.rootDocumentId, currentUserId)
        : null,
    }
  }

  private async resolveLinkInviteEntry(
    entry: ActiveResolverEntry,
    currentUserId: string | null,
  ): Promise<DocumentCollaborationResolverPreview> {
    const link = await this.prisma.documentCollaborationLinkInvite.findUnique({
      where: { id: entry.targetId },
      select: linkInviteResolverSelect,
    })

    if (!isResolvableLinkInvite(link)) {
      throw new NotFoundException('协作链接不存在或已失效')
    }

    return {
      code: entry.code,
      type: COLLABORATION_RESOLVER_ENTRY_TYPE.DOCUMENT_LINK_INVITE,
      status: link.enabled
        ? DOCUMENT_COLLABORATION_RESOLVER_STATUS.ENABLED
        : DOCUMENT_COLLABORATION_RESOLVER_STATUS.DISABLED,
      rootDocumentId: currentUserId ? link.rootDocumentId : null,
      documentTitle: link.rootDocument.title,
      inviter: toAuditUserSummary(link.createdByUser),
      permission: link.permission as DocumentCollaborationPermission,
      scope: link.scope as DocumentCollaborationScope,
      passwordRequired: Boolean(link.passwordEnabled && link.passwordHash),
      currentAccess: currentUserId
        ? await this.loadCurrentAccessSummary(link.rootDocumentId, currentUserId)
        : null,
    }
  }

  private async confirmUserInviteEntry(
    userId: string,
    entry: ActiveResolverEntry,
  ): Promise<DocumentCollaborationJoinResponse> {
    const invite = await this.prisma.documentCollaborationUserInvite.findUnique({
      where: { id: entry.targetId },
      select: userInviteResolverSelect,
    })

    if (!isResolvableUserInvite(invite)) {
      throw new NotFoundException('协作邀请不存在或已失效')
    }

    if (invite.inviteeUserId !== userId) {
      throw new ForbiddenException('无权处理该协作邀请')
    }

    if (
      invite.status !== DOCUMENT_COLLABORATION_USER_INVITE_STATUS.PENDING
      && invite.status !== DOCUMENT_COLLABORATION_USER_INVITE_STATUS.ACCEPTED
    ) {
      throw new NotFoundException('协作邀请不存在或已失效')
    }

    const grant = await this.upsertGrantFromEntry(userId, {
      rootDocumentId: invite.rootDocumentId,
      permission: invite.permission as DocumentCollaborationPermission,
      scope: invite.scope as DocumentCollaborationScope,
      sourceType: DOCUMENT_COLLABORATION_GRANT_SOURCE_TYPE.USER_INVITE,
      sourceId: invite.id,
      actorUserId: userId,
    })

    if (invite.status === DOCUMENT_COLLABORATION_USER_INVITE_STATUS.PENDING) {
      await this.prisma.documentCollaborationUserInvite.update({
        where: { id: invite.id },
        data: {
          status: DOCUMENT_COLLABORATION_USER_INVITE_STATUS.ACCEPTED,
          acceptedGrantId: grant.id,
          updatedBy: userId,
        },
      })
    }

    return {
      documentId: invite.rootDocumentId,
      grant,
    }
  }

  private async confirmLinkInviteEntry(
    userId: string,
    entry: ActiveResolverEntry,
    payload: ConfirmDocumentCollaborationResolverEntryRequest,
  ): Promise<DocumentCollaborationJoinResponse> {
    const link = await this.prisma.documentCollaborationLinkInvite.findUnique({
      where: { id: entry.targetId },
      select: linkInviteResolverSelect,
    })

    if (!isResolvableLinkInvite(link) || !link.enabled) {
      throw new NotFoundException('协作链接不存在或已失效')
    }

    if (link.passwordEnabled && link.passwordHash && !(await verifyCollaborationPassword(payload.password ?? '', link.passwordHash))) {
      throw new ForbiddenException('协作链接密码错误')
    }

    const grant = await this.upsertGrantFromEntry(userId, {
      rootDocumentId: link.rootDocumentId,
      permission: link.permission as DocumentCollaborationPermission,
      scope: link.scope as DocumentCollaborationScope,
      sourceType: DOCUMENT_COLLABORATION_GRANT_SOURCE_TYPE.LINK_INVITE,
      sourceId: link.id,
      actorUserId: userId,
    })

    return {
      documentId: link.rootDocumentId,
      grant,
    }
  }

  private async loadCurrentAccessSummary(
    rootDocumentId: string,
    userId: string,
  ): Promise<DocumentCollaborationCurrentAccessSummary | null> {
    try {
      const document = await this.documentAccessService.assertCanReadDocument(userId, rootDocumentId)

      return {
        permission: document.access.permission,
        scope: document.access.scope,
      }
    }
    catch (error) {
      if (error instanceof NotFoundException) {
        return null
      }

      throw error
    }
  }

  private async assertCanManageCollaborations(userId: string, documentId: string): Promise<void> {
    const document = await this.documentAccessService.assertCanReadDocument(userId, documentId)

    if (!document.access.capabilities.canManageCollaboration) {
      throw new ForbiddenException('无权管理文档协作')
    }
  }

  private async findUserByCode(userCode: string) {
    const normalizedUserCode = normalizeUserCodeQuery(userCode)

    if (!isExactUserCodeQuery(normalizedUserCode)) {
      throw new NotFoundException('未找到用户')
    }

    const user = await this.prisma.user.findUnique({
      where: { userCode: normalizedUserCode },
      select: userCollabIdentitySelect,
    })

    if (!user) {
      throw new NotFoundException('未找到用户')
    }

    return user
  }

  private async loadResolverCodes(type: string, targetIds: string[]): Promise<Map<string, string>> {
    if (targetIds.length === 0) {
      return new Map()
    }

    const resolverEntries = await this.prisma.collaborationResolverEntry.findMany({
      where: {
        type: type as never,
        targetId: {
          in: targetIds,
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

  private async createResolverEntry(
    tx: Prisma.TransactionClient,
    input: ResolverEntryCreateInput,
  ): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateResolverCode()

      try {
        await tx.collaborationResolverEntry.create({
          data: {
            code,
            type: input.type,
            targetId: input.targetId,
            status: COLLABORATION_RESOLVER_ENTRY_STATUS.ACTIVE,
          },
        })

        return code
      }
      catch (error) {
        if (!isPrismaUniqueConstraintError(error)) {
          throw error
        }
      }
    }

    throw new ConflictException('协作入口生成失败，请重试')
  }

  private async loadCollaborationRootDocument(documentId: string): Promise<PersistedCollaborationRootDocument> {
    const rootDocument = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: collaborationRootDocumentSelect,
    })

    if (!rootDocument) {
      throw new NotFoundException('协作文档不存在')
    }

    return rootDocument
  }

  private async loadAncestorDocuments(initialParentId: string | null): Promise<DocumentAncestor[]> {
    const ancestors: DocumentAncestor[] = []
    let parentId = initialParentId

    while (parentId) {
      const parent = await this.prisma.document.findUnique({
        where: { id: parentId },
        select: {
          id: true,
          title: true,
          parentId: true,
        },
      })

      if (!parent) {
        break
      }

      ancestors.push(parent)
      parentId = parent.parentId
    }

    return ancestors
  }

  private async publishGrantInvalidation(documentId: string, userId: string): Promise<void> {
    const documentIds = await this.resolveDocumentSubtreeIds(documentId)

    await this.collabPermissionInvalidationPublisher.publishPermissionInvalidations(
      documentIds.map(targetDocumentId => ({
        reason: COLLAB_PERMISSION_INVALIDATION_REASON.COLLABORATION_REVOKED,
        documentId: targetDocumentId,
        userId,
      })),
    )
  }

  private async resolveDocumentSubtreeIds(rootDocumentId: string): Promise<string[]> {
    const rootDocument = await this.prisma.document.findUnique({
      where: { id: rootDocumentId },
      select: {
        workspaceId: true,
      },
    })

    if (!rootDocument) {
      return [rootDocumentId]
    }

    const documentIds = new Set([rootDocumentId])
    let parentIds = [rootDocumentId]

    for (let depth = 0; parentIds.length > 0 && depth < 64; depth += 1) {
      const children = await this.prisma.document.findMany({
        where: {
          workspaceId: rootDocument.workspaceId,
          parentId: {
            in: parentIds,
          },
          status: {
            in: [DocumentStatus.ACTIVE, DocumentStatus.LOCKED],
          },
          trashedAt: null,
        },
        select: {
          id: true,
        },
      })

      parentIds = children
        .map(child => child.id)
        .filter((id) => {
          if (documentIds.has(id)) {
            return false
          }

          documentIds.add(id)
          return true
        })
    }

    return Array.from(documentIds)
  }
}

function buildCollaborationConsoleTree(
  documents: PersistedCollaborationConsoleDocument[],
  linkCodes: ReadonlyMap<string, string>,
): DocumentCollaborationConsoleListResponse['tree'] {
  const documentsById = new Map(documents.map(document => [document.id, document]))
  const childrenByParent = new Map<string | null, PersistedCollaborationConsoleDocument[]>()

  for (const document of documents) {
    const parentId = document.parentId && documentsById.has(document.parentId) ? document.parentId : null
    const children = childrenByParent.get(parentId) ?? []
    children.push(document)
    childrenByParent.set(parentId, children)
  }

  for (const children of childrenByParent.values()) {
    children.sort(compareCollaborationConsoleDocument)
  }

  return (childrenByParent.get(null) ?? []).map(document =>
    buildCollaborationConsoleTreeItem(document, childrenByParent, linkCodes),
  )
}

function buildCollaborationConsoleTreeItem(
  document: PersistedCollaborationConsoleDocument,
  childrenByParent: ReadonlyMap<string | null, PersistedCollaborationConsoleDocument[]>,
  linkCodes: ReadonlyMap<string, string>,
): DocumentCollaborationConsoleListResponse['tree'][number] {
  const children = (childrenByParent.get(document.id) ?? []).map(child =>
    buildCollaborationConsoleTreeItem(child, childrenByParent, linkCodes),
  )
  const updatedAt = maxUpdatedAt([
    document.updatedAt,
    ...document.collaborationGrants.map(grant => grant.updatedAt),
    ...document.collaborationUserInvites.map(invite => invite.updatedAt),
    ...(document.collaborationLinkInvite ? [document.collaborationLinkInvite.updatedAt] : []),
  ])
  const linkInvite = document.collaborationLinkInvite
  const resolverCode = linkInvite ? linkCodes.get(linkInvite.id) ?? '' : ''

  return {
    id: document.id,
    title: document.title,
    parentId: document.parentId,
    hasChildren: children.length > 0,
    collaboratorCount: document.collaborationGrants.length,
    pendingInviteCount: document.collaborationUserInvites.length,
    linkInviteState: linkInvite
      ? (linkInvite.enabled
          ? DOCUMENT_COLLABORATION_LINK_INVITE_STATE.ENABLED
          : DOCUMENT_COLLABORATION_LINK_INVITE_STATE.DISABLED)
      : DOCUMENT_COLLABORATION_LINK_INVITE_STATE.NONE,
    linkInvite: linkInvite
      ? {
          id: linkInvite.id,
          permission: linkInvite.permission as DocumentCollaborationPermission,
          scope: linkInvite.scope as DocumentCollaborationScope,
          enabled: linkInvite.enabled,
          resolverCode,
          codeTail: resolverCode ? resolverCode.slice(-6) : null,
          updatedAt: linkInvite.updatedAt.toISOString(),
        }
      : null,
    rangeSummary: resolveRangeSummary([
      ...document.collaborationGrants.map(grant => grant.scope as DocumentCollaborationScope),
      ...document.collaborationUserInvites.map(invite => invite.scope as DocumentCollaborationScope),
      ...(linkInvite
        ? [linkInvite.scope as DocumentCollaborationScope]
        : []),
    ]),
    updatedAt: updatedAt.toISOString(),
    children,
  }
}

function compareCollaborationConsoleDocument(left: PersistedCollaborationConsoleDocument, right: PersistedCollaborationConsoleDocument) {
  if (left.order !== right.order) {
    return left.order - right.order
  }

  const updatedDiff = right.updatedAt.getTime() - left.updatedAt.getTime()

  return updatedDiff || left.id.localeCompare(right.id)
}

function resolveRangeSummary(scopes: DocumentCollaborationScope[]): DocumentCollaborationConsoleListResponse['tree'][number]['rangeSummary'] {
  if (!scopes.length) {
    return DOCUMENT_COLLABORATION_RANGE_SUMMARY.NONE
  }

  const scopeSet = new Set(scopes)

  if (scopeSet.size > 1) {
    return DOCUMENT_COLLABORATION_RANGE_SUMMARY.MIXED
  }

  return scopeSet.has(DOCUMENT_COLLABORATION_SCOPE.DESCENDANTS)
    ? DOCUMENT_COLLABORATION_RANGE_SUMMARY.DESCENDANTS
    : DOCUMENT_COLLABORATION_RANGE_SUMMARY.SELF
}

function maxUpdatedAt(dates: Date[]): Date {
  return new Date(Math.max(...dates.map(date => date.getTime())))
}

function toDocumentCollaborationGrant(grant: PersistedCollaborationGrant): DocumentCollaborationGrant {
  return {
    id: grant.id,
    rootDocumentId: grant.rootDocumentId,
    userId: grant.userId,
    user: grant.user,
    permission: grant.permission as DocumentCollaborationGrant['permission'],
    scope: grant.scope as DocumentCollaborationGrant['scope'],
    sourceType: grant.sourceType as DocumentCollaborationGrant['sourceType'],
    sourceId: grant.sourceId,
    status: grant.status as DocumentCollaborationGrant['status'],
    createdAt: grant.createdAt.toISOString(),
    createdBy: grant.createdBy,
    updatedAt: grant.updatedAt.toISOString(),
    updatedBy: grant.updatedBy,
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

function isActiveResolverEntry(entry: PersistedResolverEntry | null): entry is PersistedResolverEntry & ActiveResolverEntry {
  return Boolean(
    entry
    && entry.status === COLLABORATION_RESOLVER_ENTRY_STATUS.ACTIVE
    && (
      entry.type === COLLABORATION_RESOLVER_ENTRY_TYPE.DOCUMENT_USER_INVITE
      || entry.type === COLLABORATION_RESOLVER_ENTRY_TYPE.DOCUMENT_LINK_INVITE
    ),
  )
}

function isResolvableUserInvite(invite: PersistedUserInviteResolver | null): invite is PersistedUserInviteResolver {
  return Boolean(invite && isActiveRootDocument(invite.rootDocument))
}

function isResolvableLinkInvite(link: PersistedLinkInviteResolver | null): link is PersistedLinkInviteResolver {
  return Boolean(link && isActiveRootDocument(link.rootDocument))
}

function isActiveRootDocument(document: { status: DocumentStatus, trashedAt: Date | null }): boolean {
  return (
    document.trashedAt === null
    && (document.status === DocumentStatus.ACTIVE || document.status === DocumentStatus.LOCKED)
  )
}

function resolveNearestInheritedGrantByUserId(input: {
  inheritedGrants: PersistedCollaborationGrant[]
  ancestors: DocumentAncestor[]
}): Map<string, PersistedCollaborationGrant> {
  const ancestorIndexById = new Map(input.ancestors.map((ancestor, index) => [ancestor.id, index]))
  const nearestInheritedGrants = new Map<string, PersistedCollaborationGrant>()
  const orderedInheritedGrants = [...input.inheritedGrants].sort((left, right) => {
    const leftIndex = ancestorIndexById.get(left.rootDocumentId) ?? Number.MAX_SAFE_INTEGER
    const rightIndex = ancestorIndexById.get(right.rootDocumentId) ?? Number.MAX_SAFE_INTEGER

    return leftIndex - rightIndex
  })

  for (const grant of orderedInheritedGrants) {
    if (nearestInheritedGrants.has(grant.userId)) {
      continue
    }

    nearestInheritedGrants.set(grant.userId, grant)
  }

  return nearestInheritedGrants
}

function toDocumentCollaborationInheritedSource(
  grant: PersistedCollaborationGrant,
  ancestorById: Map<string, DocumentAncestor>,
) {
  const inheritedFrom = ancestorById.get(grant.rootDocumentId)

  return {
    rootDocumentId: grant.rootDocumentId,
    title: inheritedFrom?.title ?? '',
    permission: grant.permission as DocumentCollaborationPermission,
    scope: grant.scope as DocumentCollaborationScope,
  }
}

function toDocumentCollaborationUserInvite(invite: PersistedCollaborationUserInvite, resolverCode: string): DocumentCollaborationUserInvite {
  return {
    id: invite.id,
    rootDocumentId: invite.rootDocumentId,
    inviteeUserId: invite.inviteeUserId,
    inviteeUser: invite.inviteeUser,
    permission: invite.permission as DocumentCollaborationUserInvite['permission'],
    scope: invite.scope as DocumentCollaborationUserInvite['scope'],
    status: invite.status as DocumentCollaborationUserInvite['status'],
    resolverCode,
    createdAt: invite.createdAt.toISOString(),
    createdBy: invite.createdBy,
    updatedAt: invite.updatedAt.toISOString(),
    updatedBy: invite.updatedBy,
  }
}

function toDocumentCollaborationLinkInvite(link: PersistedCollaborationLinkInvite, resolverCode: string): DocumentCollaborationLinkInvite {
  return {
    id: link.id,
    rootDocumentId: link.rootDocumentId,
    permission: link.permission as DocumentCollaborationLinkInvite['permission'],
    scope: link.scope as DocumentCollaborationLinkInvite['scope'],
    enabled: link.enabled,
    passwordEnabled: link.passwordEnabled,
    password: link.passwordCode,
    resolverCode,
    codeTail: resolverCode ? resolverCode.slice(-6) : null,
    createdAt: link.createdAt.toISOString(),
    createdBy: link.createdBy,
    updatedAt: link.updatedAt.toISOString(),
    updatedBy: link.updatedBy,
  }
}

function maxPermission(
  currentPermission: DocumentCollaborationPermission,
  incomingPermission: DocumentCollaborationPermission,
): DocumentCollaborationPermission {
  if (
    currentPermission === DOCUMENT_COLLABORATION_PERMISSION.EDIT
    || incomingPermission === DOCUMENT_COLLABORATION_PERMISSION.EDIT
  ) {
    return DOCUMENT_COLLABORATION_PERMISSION.EDIT
  }

  return DOCUMENT_COLLABORATION_PERMISSION.READ
}

function maxScope(
  currentScope: DocumentCollaborationScope,
  incomingScope: DocumentCollaborationScope,
): DocumentCollaborationScope {
  if (
    currentScope === DOCUMENT_COLLABORATION_SCOPE.DESCENDANTS
    || incomingScope === DOCUMENT_COLLABORATION_SCOPE.DESCENDANTS
  ) {
    return DOCUMENT_COLLABORATION_SCOPE.DESCENDANTS
  }

  return DOCUMENT_COLLABORATION_SCOPE.SELF
}

function generateResolverCode(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

  return Array.from(randomBytes(16), byte => alphabet[byte & 31]).join('')
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}
