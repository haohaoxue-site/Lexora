import type {
  DocumentCollaborationAccess,
  DocumentCollaborationPermission,
  DocumentCollaborationScope,
  DocumentVisibility,
  WorkspaceMemberRole,
  WorkspaceType,
} from '@haohaoxue/lexora-contracts'
import {
  DOCUMENT_COLLABORATION_ACCESS_SOURCE,
  DOCUMENT_COLLABORATION_GRANT_STATUS,
  DOCUMENT_COLLABORATION_PERMISSION,
  DOCUMENT_COLLABORATION_SCOPE,
  DOCUMENT_VISIBILITY,
  WORKSPACE_MEMBER_ROLE,
  WORKSPACE_MEMBER_STATUS,
  WORKSPACE_TYPE,
} from '@haohaoxue/lexora-contracts'
import {
  canManageDocumentCollaborators,
  getDocumentCollaborationCapabilities,
  getWorkspaceDocumentCollaborationCapabilities,
} from '@haohaoxue/lexora-shared'
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
  access: DocumentCollaborationAccess
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

  async hasWorkspaceCollaborationManagementAccess(userId: string, workspaceId: string): Promise<boolean> {
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

    return canManageDocumentCollaborators({
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

    if (!document) {
      throw new NotFoundException(`Document "${documentId}" not found`)
    }

    if (options.requireTrashed ? !document.trashedAt : Boolean(document.trashedAt)) {
      throw new NotFoundException(`Document "${documentId}" not found`)
    }

    const workspaceAccess = resolveWorkspaceAccess({
      userId,
      workspaceType: document.workspace.type,
      workspaceMemberRole: document.workspace.members[0]?.role,
      visibility: document.visibility,
      createdBy: document.createdBy,
    })
    const access = workspaceAccess ?? await this.resolveCollaborationGrantAccess(userId, document)

    if (!access) {
      throw new NotFoundException(`Document "${documentId}" not found`)
    }

    if (options.access === 'edit' && !access.capabilities.canEdit) {
      throw new NotFoundException(`Document "${documentId}" not found`)
    }

    return toAccessibleDocument(document, access)
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

  private async resolveCollaborationGrantAccess(
    userId: string,
    document: PersistedDocumentAccessRecord,
  ): Promise<DocumentCollaborationAccess | null> {
    const documentPath = await this.loadDocumentPath(document)
    const pathIndexByDocumentId = new Map(documentPath.map((node, index) => [node.id, index]))
    const grants = await this.prisma.documentCollaborationGrant.findMany({
      where: {
        userId,
        status: DOCUMENT_COLLABORATION_GRANT_STATUS.ACTIVE,
        rootDocumentId: {
          in: documentPath.map(node => node.id),
        },
        rootDocument: {
          trashedAt: null,
        },
      },
      select: {
        id: true,
        rootDocumentId: true,
        permission: true,
        scope: true,
        sourceType: true,
      },
    })
    const grant = grants
      .filter((candidate) => {
        if (candidate.rootDocumentId === document.id) {
          return true
        }

        return candidate.scope === DOCUMENT_COLLABORATION_SCOPE.DESCENDANTS
      })
      .sort((left, right) => {
        const leftPathIndex = pathIndexByDocumentId.get(left.rootDocumentId) ?? Number.MAX_SAFE_INTEGER
        const rightPathIndex = pathIndexByDocumentId.get(right.rootDocumentId) ?? Number.MAX_SAFE_INTEGER

        if (leftPathIndex !== rightPathIndex) {
          return leftPathIndex - rightPathIndex
        }

        return getPermissionRank(right.permission as DocumentCollaborationPermission)
          - getPermissionRank(left.permission as DocumentCollaborationPermission)
      })[0]

    if (!grant) {
      return null
    }

    return toCollaborationAccess({
      source: DOCUMENT_COLLABORATION_ACCESS_SOURCE.GRANT,
      permission: grant.permission,
      scope: grant.scope,
      rootDocumentId: grant.rootDocumentId,
      grantId: grant.id,
    })
  }

  private async loadDocumentPath(document: PersistedDocumentAccessRecord): Promise<Array<{ id: string, parentId: string | null }>> {
    const path = [{ id: document.id, parentId: document.parentId }]
    let parentId = document.parentId

    while (parentId) {
      const parent = await this.prisma.document.findUnique({
        where: { id: parentId },
        select: {
          id: true,
          parentId: true,
        },
      })

      if (!parent) {
        break
      }

      path.push(parent)
      parentId = parent.parentId
    }

    return path
  }
}

function resolveWorkspaceAccess(input: {
  userId: string
  workspaceType: WorkspaceType
  workspaceMemberRole?: WorkspaceMemberRole | null
  visibility: string
  createdBy: string
}): DocumentCollaborationAccess | null {
  if (input.workspaceType === WORKSPACE_TYPE.PERSONAL) {
    const capabilities = getWorkspaceDocumentCollaborationCapabilities({
      workspaceType: input.workspaceType,
      workspaceMemberRole: input.workspaceMemberRole ?? null,
    })

    if (!capabilities) {
      return null
    }

    return toWorkspaceAccess({
      source: DOCUMENT_COLLABORATION_ACCESS_SOURCE.OWNER,
      scope: DOCUMENT_COLLABORATION_SCOPE.DESCENDANTS,
      rootDocumentId: '',
      grantId: null,
      capabilities,
    })
  }

  if (input.workspaceType !== WORKSPACE_TYPE.TEAM) {
    return null
  }

  if (input.visibility === DOCUMENT_VISIBILITY.PRIVATE) {
    if (input.createdBy !== input.userId) {
      return null
    }

    return toWorkspaceAccess({
      source: DOCUMENT_COLLABORATION_ACCESS_SOURCE.OWNER,
      scope: DOCUMENT_COLLABORATION_SCOPE.DESCENDANTS,
      rootDocumentId: '',
      grantId: null,
      capabilities: {
        canRead: true,
        canEdit: true,
        canCreateChild: true,
        canManageCollaboration: true,
        canPublish: true,
        canMove: true,
        canTrash: true,
        canRestore: true,
      },
    })
  }

  const capabilities = getWorkspaceDocumentCollaborationCapabilities({
    workspaceType: input.workspaceType,
    workspaceMemberRole: input.workspaceMemberRole ?? null,
  })

  if (!capabilities) {
    return null
  }

  return toWorkspaceAccess({
    source: DOCUMENT_COLLABORATION_ACCESS_SOURCE.WORKSPACE,
    scope: DOCUMENT_COLLABORATION_SCOPE.DESCENDANTS,
    rootDocumentId: '',
    grantId: null,
    capabilities,
  })
}

function toAccessibleDocument(document: PersistedDocumentAccessRecord, access: DocumentCollaborationAccess) {
  return {
    id: document.id,
    workspaceId: document.workspaceId,
    parentId: document.parentId,
    visibility: document.visibility,
    createdBy: document.createdBy,
    workspaceType: document.workspace.type,
    workspaceMemberRole: document.workspace.members[0]?.role ?? null,
    access: {
      ...access,
      rootDocumentId: access.rootDocumentId || document.id,
    },
  }
}

function toCollaborationAccess(input: {
  source: string
  permission: string
  scope: string
  rootDocumentId: string
  grantId: string | null
}): DocumentCollaborationAccess {
  const permission = input.permission as DocumentCollaborationPermission
  const scope = input.scope as DocumentCollaborationScope
  const capabilities = getDocumentCollaborationCapabilities({ permission, scope })

  return {
    source: input.source as DocumentCollaborationAccess['source'],
    permission,
    scope,
    rootDocumentId: input.rootDocumentId,
    grantId: input.grantId,
    capabilities,
  }
}

function toWorkspaceAccess(input: {
  source: string
  scope: string
  rootDocumentId: string
  grantId: string | null
  capabilities: DocumentCollaborationAccess['capabilities']
}): DocumentCollaborationAccess {
  return {
    source: input.source as DocumentCollaborationAccess['source'],
    permission: DOCUMENT_COLLABORATION_PERMISSION.EDIT,
    scope: input.scope as DocumentCollaborationScope,
    rootDocumentId: input.rootDocumentId,
    grantId: input.grantId,
    capabilities: input.capabilities,
  }
}

function getPermissionRank(permission: DocumentCollaborationPermission): number {
  if (permission === DOCUMENT_COLLABORATION_PERMISSION.EDIT) {
    return 2
  }

  return 1
}
