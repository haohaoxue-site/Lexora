import { Prisma } from '@prisma/client'

export const RECENT_DOCUMENT_ROUTE_KIND = {
  DOCUMENT: 'DOCUMENT',
  SHARE: 'SHARE',
  SHARE_RECIPIENT: 'SHARE_RECIPIENT',
} as const

export type RecentDocumentRouteKind = (typeof RECENT_DOCUMENT_ROUTE_KIND)[keyof typeof RECENT_DOCUMENT_ROUTE_KIND]

export async function upsertRecentDocumentVisit(
  client: Pick<Prisma.TransactionClient, 'documentRecentVisit'>,
  input: {
    documentId: string
    userId: string
    routeKind: RecentDocumentRouteKind
    routeEntryId: string | null
  },
): Promise<void> {
  await client.documentRecentVisit.upsert({
    where: {
      documentId_userId: {
        documentId: input.documentId,
        userId: input.userId,
      },
    },
    create: {
      documentId: input.documentId,
      userId: input.userId,
      routeKind: input.routeKind,
      routeEntryId: input.routeEntryId,
      visitedAt: new Date(),
    },
    update: {
      routeKind: input.routeKind,
      routeEntryId: input.routeEntryId,
      visitedAt: new Date(),
    },
  })
}
