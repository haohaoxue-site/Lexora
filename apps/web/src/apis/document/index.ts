import type {
  CreateCollabTicketResponse,
  CreateDocumentRequest,
  CreateDocumentResponse,
  CreateDocumentVersionSnapshotRequest,
  CreateDocumentVersionSnapshotResponse,
  DocumentAsset,
  DocumentCurrent,
  DocumentRecent,
  DocumentTrashItem,
  DocumentTreeGroup,
  DocumentVersionSnapshot,
  PatchDocumentMetaRequest,
  ResolveDocumentAssetsRequest,
  ResolveDocumentAssetsResponse,
  RestoreDocumentVersionSnapshotRequest,
  RestoreDocumentVersionSnapshotResponse,
} from './typing'
import { axios } from '@/utils/axios'

export * from './typing'

export function getDocuments(workspaceId: string): Promise<DocumentTreeGroup[]> {
  return axios.request({
    method: 'get',
    url: '/documents',
    params: {
      workspaceId,
    },
  })
}

export function createDocument(data: CreateDocumentRequest): Promise<CreateDocumentResponse> {
  return axios.request({
    method: 'post',
    url: '/documents',
    data,
  })
}

export function getRecentDocuments(): Promise<DocumentRecent[]> {
  return axios.request({
    method: 'get',
    url: '/documents/recent',
  })
}

export function getTrashDocuments(workspaceId: string): Promise<DocumentTrashItem[]> {
  return axios.request({
    method: 'get',
    url: '/documents/trash',
    params: {
      workspaceId,
    },
  })
}

interface GetDocumentCurrentOptions {
  recordVisit?: boolean
}

export function getDocumentCurrent(id: string, options: GetDocumentCurrentOptions = {}): Promise<DocumentCurrent> {
  return axios.request({
    method: 'get',
    url: `/documents/${id}`,
    params: options.recordVisit
      ? {
          recordVisit: true,
        }
      : undefined,
  })
}

export function createDocumentVersionSnapshot(
  id: string,
  data: CreateDocumentVersionSnapshotRequest,
): Promise<CreateDocumentVersionSnapshotResponse> {
  return axios.request({
    method: 'post',
    url: `/documents/${id}/version-snapshots`,
    data,
  })
}

export function createDocumentCollabTicket(id: string): Promise<CreateCollabTicketResponse> {
  return axios.request({
    method: 'post',
    url: `/documents/${id}/collab-ticket`,
  })
}

export function getDocumentVersionSnapshots(id: string): Promise<DocumentVersionSnapshot[]> {
  return axios.request({
    method: 'get',
    url: `/documents/${id}/version-snapshots`,
  })
}

export function restoreDocumentVersionSnapshot(
  id: string,
  data: RestoreDocumentVersionSnapshotRequest,
): Promise<RestoreDocumentVersionSnapshotResponse> {
  return axios.request({
    method: 'post',
    url: `/documents/${id}/restore-version`,
    data,
  })
}

export function patchDocumentMeta(id: string, data: PatchDocumentMetaRequest): Promise<DocumentCurrent> {
  return axios.request({
    method: 'patch',
    url: `/documents/${id}/meta`,
    data,
  })
}

export function deleteDocument(id: string): Promise<null> {
  return axios.request({
    method: 'delete',
    url: `/documents/${id}`,
  })
}

export function restoreDocumentFromTrash(id: string): Promise<null> {
  return axios.request({
    method: 'post',
    url: `/documents/${id}/restore-from-trash`,
  })
}

export function permanentlyDeleteDocument(id: string): Promise<null> {
  return axios.request({
    method: 'delete',
    url: `/documents/${id}/permanent`,
  })
}

export function uploadDocumentImage(id: string, file: File): Promise<DocumentAsset> {
  const data = new FormData()
  data.append('file', file)

  return axios.request({
    method: 'post',
    url: `/documents/${id}/assets/images`,
    data,
  })
}

export function uploadDocumentFile(id: string, file: File): Promise<DocumentAsset> {
  const data = new FormData()
  data.append('file', file)

  return axios.request({
    method: 'post',
    url: `/documents/${id}/assets/files`,
    data,
  })
}

export function resolveDocumentAssets(
  id: string,
  data: ResolveDocumentAssetsRequest,
): Promise<ResolveDocumentAssetsResponse> {
  return axios.request({
    method: 'post',
    url: `/documents/${id}/assets/resolve`,
    data,
  })
}
