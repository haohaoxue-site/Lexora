import type {
  CreateDirectDocumentShareRequest,
  DocumentCurrent,
  DocumentPublicShareInfo,
  DocumentShareAccess,
  DocumentShareRecipientSummary,
  ResolveDocumentAssetsRequest,
  ResolveDocumentAssetsResponse,
  SetDocumentLinkShareRequest,
} from './typing'
import { axios } from '@/utils/axios'

export * from './typing'

export function getDocumentPublicShare(documentId: string): Promise<DocumentPublicShareInfo> {
  return axios.request({
    method: 'get',
    url: `/documents/${documentId}/shares/public`,
  })
}

export function enableDocumentPublicShare(
  documentId: string,
  data: SetDocumentLinkShareRequest,
): Promise<DocumentPublicShareInfo> {
  return axios.request({
    method: 'post',
    url: `/documents/${documentId}/shares/public`,
    data,
  })
}

export function revokeDocumentPublicShare(documentId: string): Promise<null> {
  return axios.request({
    method: 'delete',
    url: `/documents/${documentId}/shares/public`,
  })
}

export function setDocumentNoSharePolicy(
  documentId: string,
  data: { confirmUnlinkInheritance?: boolean } = {},
): Promise<null> {
  return axios.request({
    method: 'post',
    url: `/documents/${documentId}/shares/none`,
    data,
  })
}

export function restoreDocumentShareInheritance(documentId: string): Promise<null> {
  return axios.request({
    method: 'delete',
    url: `/documents/${documentId}/shares/local-policy`,
  })
}

export function getDocumentDirectShares(documentId: string): Promise<DocumentShareRecipientSummary[]> {
  return axios.request({
    method: 'get',
    url: `/documents/${documentId}/shares/direct`,
  })
}

export function createDocumentDirectShare(
  documentId: string,
  data: CreateDirectDocumentShareRequest,
): Promise<DocumentShareRecipientSummary> {
  return axios.request({
    method: 'post',
    url: `/documents/${documentId}/shares/direct`,
    data,
  })
}

export function revokeDocumentDirectShare(documentId: string, recipientId: string): Promise<null> {
  return axios.request({
    method: 'delete',
    url: `/documents/${documentId}/shares/direct/${recipientId}`,
  })
}

export function getDocumentShareAccess(shareId: string): Promise<DocumentShareAccess> {
  return axios.request({
    method: 'get',
    url: `/document-shares/${shareId}`,
  })
}

export function getDocumentShareDocumentCurrent(shareId: string, documentId: string): Promise<DocumentCurrent> {
  return axios.request({
    method: 'get',
    url: `/document-shares/${shareId}/documents/${documentId}`,
  })
}

export function resolveDocumentShareAssets(
  shareId: string,
  documentId: string,
  data: ResolveDocumentAssetsRequest,
): Promise<ResolveDocumentAssetsResponse> {
  return axios.request({
    method: 'post',
    url: `/document-shares/${shareId}/documents/${documentId}/assets/resolve`,
    data,
  })
}

export function acceptDocumentShare(shareId: string): Promise<DocumentShareAccess> {
  return axios.request({
    method: 'post',
    url: `/document-shares/${shareId}/accept`,
  })
}

export function declineDocumentShare(shareId: string): Promise<DocumentShareAccess> {
  return axios.request({
    method: 'post',
    url: `/document-shares/${shareId}/decline`,
  })
}

export function getPendingDocumentShareRecipients(): Promise<DocumentShareRecipientSummary[]> {
  return axios.request({
    method: 'get',
    url: '/document-share-recipients/pending',
  })
}

export function getActiveDocumentShareRecipients(): Promise<DocumentShareRecipientSummary[]> {
  return axios.request({
    method: 'get',
    url: '/document-share-recipients/active',
  })
}

export function getDocumentShareRecipientAccess(recipientId: string): Promise<DocumentShareAccess> {
  return axios.request({
    method: 'get',
    url: `/document-share-recipients/${recipientId}`,
  })
}

export function getDocumentShareRecipientDocumentCurrent(recipientId: string, documentId: string): Promise<DocumentCurrent> {
  return axios.request({
    method: 'get',
    url: `/document-share-recipients/${recipientId}/documents/${documentId}`,
  })
}

export function resolveDocumentShareRecipientAssets(
  recipientId: string,
  documentId: string,
  data: ResolveDocumentAssetsRequest,
): Promise<ResolveDocumentAssetsResponse> {
  return axios.request({
    method: 'post',
    url: `/document-share-recipients/${recipientId}/documents/${documentId}/assets/resolve`,
    data,
  })
}

export function acceptDocumentShareRecipient(recipientId: string): Promise<DocumentShareAccess> {
  return axios.request({
    method: 'post',
    url: `/document-share-recipients/${recipientId}/accept`,
  })
}

export function declineDocumentShareRecipient(recipientId: string): Promise<DocumentShareAccess> {
  return axios.request({
    method: 'post',
    url: `/document-share-recipients/${recipientId}/decline`,
  })
}

export function exitDocumentShareRecipient(recipientId: string): Promise<DocumentShareAccess> {
  return axios.request({
    method: 'post',
    url: `/document-share-recipients/${recipientId}/exit`,
  })
}
