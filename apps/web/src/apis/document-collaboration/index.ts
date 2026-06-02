import type {
  ConfirmDocumentCollaborationResolverEntryRequest,
  CreateDocumentCollaborationUserInviteRequest,
  DocumentCollaborationConsoleListResponse,
  DocumentCollaborationGrant,
  DocumentCollaborationJoinResponse,
  DocumentCollaborationOverview,
  DocumentCollaborationResolverPreview,
  DocumentCollaborationUserInvite,
  SetDocumentCollaborationUserGrantRequest,
  UpdateDocumentCollaborationGrantRequest,
  UpsertDocumentCollaborationLinkInviteRequest,
  UpsertDocumentCollaborationLinkInviteResponse,
  UserCollabIdentity,
} from './typing'
import { axios } from '@/utils/axios'

export * from './typing'

export function listDocumentCollaborationConsoleTree(workspaceId: string): Promise<DocumentCollaborationConsoleListResponse> {
  return axios.request({
    method: 'get',
    url: '/documents/collaborations',
    params: {
      workspaceId,
    },
  })
}

export function getDocumentCollaborationOverview(documentId: string): Promise<DocumentCollaborationOverview> {
  return axios.request({
    method: 'get',
    url: `/documents/${documentId}/collaborations`,
  })
}

export function createDocumentCollaborationInvitation(
  documentId: string,
  data: CreateDocumentCollaborationUserInviteRequest,
): Promise<DocumentCollaborationUserInvite> {
  return axios.request({
    method: 'post',
    url: `/documents/${documentId}/collaborations/invitations`,
    data,
  })
}

export function resolveDocumentCollaborationInvitee(
  documentId: string,
  userCode: string,
): Promise<UserCollabIdentity> {
  return axios.request({
    method: 'get',
    url: `/documents/${documentId}/collaborations/users/resolve`,
    params: {
      userCode,
    },
  })
}

export function upsertDocumentCollaborationLink(
  documentId: string,
  data: UpsertDocumentCollaborationLinkInviteRequest,
): Promise<UpsertDocumentCollaborationLinkInviteResponse> {
  return axios.request({
    method: 'put',
    url: `/documents/${documentId}/collaborations/link`,
    data,
  })
}

export function disableDocumentCollaborationLink(documentId: string): Promise<null> {
  return axios.request({
    method: 'delete',
    url: `/documents/${documentId}/collaborations/link`,
  })
}

export function resetDocumentCollaborationLink(documentId: string): Promise<UpsertDocumentCollaborationLinkInviteResponse> {
  return axios.request({
    method: 'post',
    url: `/documents/${documentId}/collaborations/link/reset`,
  })
}

export function updateDocumentCollaborationGrant(
  documentId: string,
  grantId: string,
  data: UpdateDocumentCollaborationGrantRequest,
): Promise<DocumentCollaborationGrant> {
  return axios.request({
    method: 'patch',
    url: `/documents/${documentId}/collaborations/grants/${grantId}`,
    data,
  })
}

export function setDocumentCollaborationUserGrant(
  documentId: string,
  targetUserId: string,
  data: SetDocumentCollaborationUserGrantRequest,
): Promise<DocumentCollaborationGrant> {
  return axios.request({
    method: 'put',
    url: `/documents/${documentId}/collaborations/users/${targetUserId}/grant`,
    data,
  })
}

export function removeDocumentCollaborationGrant(documentId: string, grantId: string): Promise<null> {
  return axios.request({
    method: 'delete',
    url: `/documents/${documentId}/collaborations/grants/${grantId}`,
  })
}

export function cancelDocumentCollaborationInvitation(documentId: string, invitationId: string): Promise<null> {
  return axios.request({
    method: 'delete',
    url: `/documents/${documentId}/collaborations/invitations/${invitationId}`,
  })
}

export function acceptDocumentCollaborationInvitation(invitationId: string): Promise<DocumentCollaborationGrant> {
  return axios.request({
    method: 'post',
    url: `/documents/collaborations/invitations/${invitationId}/accept`,
  })
}

export function declineDocumentCollaborationInvitation(invitationId: string): Promise<DocumentCollaborationUserInvite> {
  return axios.request({
    method: 'post',
    url: `/documents/collaborations/invitations/${invitationId}/decline`,
  })
}

export function resolveDocumentCollaborationEntry(code: string): Promise<DocumentCollaborationResolverPreview> {
  return axios.request({
    method: 'get',
    url: `/r/${code}`,
  })
}

export function confirmDocumentCollaborationEntry(
  code: string,
  data: ConfirmDocumentCollaborationResolverEntryRequest = {},
): Promise<DocumentCollaborationJoinResponse> {
  return axios.request({
    method: 'post',
    url: `/r/${code}/confirm`,
    data,
  })
}
