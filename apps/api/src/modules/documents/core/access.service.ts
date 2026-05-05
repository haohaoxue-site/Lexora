import type { DocumentVisibility, WorkspaceMemberRole, WorkspaceType } from '@haohaoxue/samepage-contracts'
import {
  DOCUMENT_VISIBILITY,
  WORKSPACE_MEMBER_ROLE,
  WORKSPACE_MEMBER_STATUS,
  WORKSPACE_TYPE,
} from '@haohaoxue/samepage-contracts'
import {
  canManageDocumentShare,
  getDocumentCollaborationCapabilities,
  resolveWorkspaceDocumentCollaborationRole,
} from '@haohaoxue/samepage-shared'
import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../../database/prisma.service'

type PersistedWorkspaceMembership = Prisma.WorkspaceMemberGetPayload<{
  select: typeof accessibleWorkspaceMembershipSelect
}>

type PersistedDocumentAccessRecord = Prisma.DocumentGetPayload<{
  select: typeof documentAccessRecordSelect
}>

/** 已通过访问校验的文档基础信息。 */
export interface AccessibleDocument {
  id: string
  workspaceId: string
  parentId: string | null
  visibility: DocumentVisibility
  createdBy: string
  workspaceType: string
  workspaceMemberRole?: WorkspaceMemberRole | null
}

const accessibleWorkspaceMembershipSelect = {
  workspace: {
    select: {
      id: true,
      type: true,
    },
  },
} satisfies Prisma.WorkspaceMemberSelect

const documentAccessRecordSelect = {
  id: true,
  workspaceId: true,
  parentId: true,
  visibility: true,
  createdBy: true,
  trashedAt: true,
  workspace: {
    select: {
      type: true,
      members: {
        select: {
          userId: true,
          role: true,
        },
      },
    },
  },
} satisfies Prisma.DocumentSelect

@Injectable()
export class DocumentAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAccessibleWorkspace(userId: string, workspaceId: string): Promise<PersistedWorkspaceMembership['workspace']> {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId,
        status: WORKSPACE_MEMBER_STATUS.ACTIVE,
      },
      select: accessibleWorkspaceMembershipSelect,
    })

    if (!membership) {
      throw new NotFoundException('未找到可访问的空间')
    }

    return membership.workspace
  }

  async listAccessibleWorkspaces(userId: string): Promise<Array<PersistedWorkspaceMembership['workspace']>> {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: {
        userId,
        status: WORKSPACE_MEMBER_STATUS.ACTIVE,
      },
      select: accessibleWorkspaceMembershipSelect,
    })

    return memberships.map(membership => membership.workspace)
  }

  async hasWorkspaceAccess(userId: string, workspaceId: string): Promise<boolean> {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId,
        status: WORKSPACE_MEMBER_STATUS.ACTIVE,
      },
      select: {
        userId: true,
      },
    })

    return Boolean(membership)
  }

  async hasWorkspaceOwnerAccess(userId: string, workspaceId: string): Promise<boolean> {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId,
        status: WORKSPACE_MEMBER_STATUS.ACTIVE,
        role: WORKSPACE_MEMBER_ROLE.OWNER,
      },
      select: {
        userId: true,
      },
    })

    return Boolean(membership)
  }

  async hasWorkspaceShareManagementAccess(userId: string, workspaceId: string): Promise<boolean> {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId,
        status: WORKSPACE_MEMBER_STATUS.ACTIVE,
      },
      select: {
        role: true,
        workspace: {
          select: {
            type: true,
          },
        },
      },
    })

    if (!membership) {
      return false
    }

    return canManageDocumentShare({
      workspaceType: membership.workspace.type,
      workspaceMemberRole: membership.role,
    })
  }

  async assertCanReadDocument(userId: string, documentId: string): Promise<AccessibleDocument> {
    return this.assertDocumentAccess(userId, documentId, {
      access: 'read',
      requireTrashed: false,
    })
  }

  async assertCanEditDocument(userId: string, documentId: string): Promise<AccessibleDocument> {
    return this.assertDocumentAccess(userId, documentId, {
      access: 'edit',
      requireTrashed: false,
    })
  }

  async assertCanManageTrashedDocument(userId: string, documentId: string): Promise<AccessibleDocument> {
    return this.assertDocumentAccess(userId, documentId, {
      access: 'edit',
      requireTrashed: true,
    })
  }

  private async assertDocumentAccess(
    userId: string,
    documentId: string,
    options: {
      access: 'read' | 'edit'
      requireTrashed: boolean
    },
  ): Promise<AccessibleDocument> {
    const document = await this.loadDocumentAccessRecord(userId, documentId)

    if (!document || !document.workspace.members.length) {
      throw new NotFoundException(`Document "${documentId}" not found`)
    }

    if (options.requireTrashed ? !document.trashedAt : Boolean(document.trashedAt)) {
      throw new NotFoundException(`Document "${documentId}" not found`)
    }

    if (!canUserAccessDocument({
      userId,
      access: options.access,
      workspaceType: document.workspace.type,
      workspaceMemberRole: document.workspace.members[0]?.role,
      visibility: document.visibility,
      createdBy: document.createdBy,
    })) {
      throw new NotFoundException(`Document "${documentId}" not found`)
    }

    return toAccessibleDocument(document)
  }

  private async loadDocumentAccessRecord(userId: string, documentId: string): Promise<PersistedDocumentAccessRecord | null> {
    return await this.prisma.document.findUnique({
      where: { id: documentId },
      select: {
        ...documentAccessRecordSelect,
        workspace: {
          select: {
            type: true,
            members: {
              where: {
                userId,
                status: WORKSPACE_MEMBER_STATUS.ACTIVE,
              },
              select: {
                userId: true,
                role: true,
              },
              take: 1,
            },
          },
        },
      },
    })
  }
}

function canUserAccessDocument(input: {
  userId: string
  access: 'read' | 'edit'
  workspaceType: WorkspaceType
  workspaceMemberRole?: WorkspaceMemberRole | null
  visibility: string
  createdBy: string
}) {
  if (input.workspaceType === WORKSPACE_TYPE.PERSONAL) {
    const role = resolveWorkspaceDocumentCollaborationRole({
      workspaceType: input.workspaceType,
      workspaceMemberRole: input.workspaceMemberRole ?? null,
    })

    if (!role) {
      return false
    }

    const capabilities = getDocumentCollaborationCapabilities(role)

    return input.access === 'read'
      ? capabilities.canRead
      : capabilities.canWrite
  }

  if (input.workspaceType !== WORKSPACE_TYPE.TEAM) {
    return false
  }

  if (input.visibility === DOCUMENT_VISIBILITY.PRIVATE) {
    return input.createdBy === input.userId
  }

  const role = resolveWorkspaceDocumentCollaborationRole({
    workspaceType: input.workspaceType,
    workspaceMemberRole: input.workspaceMemberRole ?? null,
  })

  if (!role) {
    return false
  }

  const capabilities = getDocumentCollaborationCapabilities(role)

  return input.access === 'read'
    ? capabilities.canRead
    : capabilities.canWrite
}

function toAccessibleDocument(document: PersistedDocumentAccessRecord) {
  return {
    id: document.id,
    workspaceId: document.workspaceId,
    parentId: document.parentId,
    visibility: document.visibility,
    createdBy: document.createdBy,
    workspaceType: document.workspace.type,
    workspaceMemberRole: document.workspace.members[0]?.role ?? null,
  }
}
