import type { DocumentAsset, ResolveDocumentAssetsResponse } from '@haohaoxue/samepage-contracts'
import type { JwtConfig } from '../../../config/auth.config'
import type { StorageObject } from '../../../infrastructure/storage/storage.interface'
import { Buffer } from 'node:buffer'
import { createSecretKey, randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import { SERVER_PATH } from '@haohaoxue/samepage-contracts'
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DocumentAssetKind, DocumentAssetStatus, Prisma } from '@prisma/client'
import { jwtVerify, SignJWT } from 'jose'
import { PrismaService } from '../../../database/prisma.service'
import { StorageService } from '../../../infrastructure/storage/storage.service'
import { sha256Hex } from '../../../utils/hash'
import { DocumentAccessService } from '../core/access.service'
import { DocumentShareRecipientsService } from '../share/share-recipients.service'

const DOCUMENT_ASSET_BUCKET = 'document-asset'
const DOCUMENT_IMAGE_MAX_SIZE_BYTES = 15 * 1024 * 1024
const DOCUMENT_FILE_MAX_SIZE_BYTES = 50 * 1024 * 1024
const DOCUMENT_ASSET_CONTENT_AUDIENCE = 'samepage-document-asset'
const DOCUMENT_ASSET_CONTENT_TOKEN_TYPE = 'document-asset-content'
const DOCUMENT_SHARED_ASSET_CONTENT_TOKEN_TYPE = 'document-share-asset-content'
const DOCUMENT_SHARED_RECIPIENT_ASSET_CONTENT_TOKEN_TYPE = 'document-share-recipient-asset-content'
const DOCUMENT_ASSET_CONTENT_URL_TTL_SECONDS = 60 * 5
const DOCUMENT_FILE_EXTENSION_PREFIX = /^\./
const DOCUMENT_FILE_EXTENSION_PATTERN = /^[a-z0-9]{1,16}$/

const DOCUMENT_IMAGE_EXTENSION_MAP = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const

type DocumentImageMimeType = keyof typeof DOCUMENT_IMAGE_EXTENSION_MAP

type PersistedDocumentAsset = Prisma.DocumentAssetGetPayload<{
  select: typeof documentAssetSelect
}>

/**
 * 文档资源内容令牌载荷。
 */
interface DocumentAssetContentTokenPayload {
  documentId: string
  assetId: string
  tokenType: typeof DOCUMENT_ASSET_CONTENT_TOKEN_TYPE
  [key: string]: unknown
}

interface SharedDocumentAssetContentTokenPayload {
  shareId: string
  documentId: string
  assetId: string
  tokenType: typeof DOCUMENT_SHARED_ASSET_CONTENT_TOKEN_TYPE
  [key: string]: unknown
}

interface SharedDocumentRecipientAssetContentTokenPayload {
  recipientId: string
  documentId: string
  assetId: string
  tokenType: typeof DOCUMENT_SHARED_RECIPIENT_ASSET_CONTENT_TOKEN_TYPE
  [key: string]: unknown
}

interface DocumentAssetAccessScope {
  documentId: string
  kind: 'document' | 'share' | 'recipient'
  shareId?: string
  recipientId?: string
}

const documentAssetSelect = {
  id: true,
  documentId: true,
  kind: true,
  status: true,
  mimeType: true,
  size: true,
  originalFileName: true,
  width: true,
  height: true,
  createdAt: true,
  bucket: true,
  objectKey: true,
} satisfies Prisma.DocumentAssetSelect

@Injectable()
export class DocumentAssetsService {
  private readonly secretKey
  private readonly jwtConfig

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly documentAccessService: DocumentAccessService,
    private readonly documentShareRecipientsService: DocumentShareRecipientsService,
    configService: ConfigService,
  ) {
    this.jwtConfig = configService.getOrThrow<JwtConfig>('jwt')
    this.secretKey = createSecretKey(Buffer.from(this.jwtConfig.accessSecret, 'utf8'))
  }

  async uploadImage(input: {
    actorId: string
    documentId: string
    fileName: string
    mimeType: string
    buffer: Buffer
  }): Promise<DocumentAsset> {
    await this.documentAccessService.assertCanEditDocument(input.actorId, input.documentId)

    const mimeType = assertDocumentImageMimeType(input.mimeType)
    assertDocumentImageBuffer(input.buffer, mimeType)
    const assetId = randomUUID()
    const objectKey = buildDocumentAssetObjectKey({
      documentId: input.documentId,
      assetId,
      extension: DOCUMENT_IMAGE_EXTENSION_MAP[mimeType],
    })

    await this.storageService.putObject({
      bucket: DOCUMENT_ASSET_BUCKET,
      key: objectKey,
      body: input.buffer,
      contentType: mimeType,
      contentLength: input.buffer.length,
      contentDisposition: {
        type: 'inline',
        fileName: input.fileName,
        fallbackFileName: 'asset',
      },
      cacheControl: 'private, max-age=300',
    })

    const sha256 = sha256Hex(input.buffer)
    const asset = await this.prisma.documentAsset.create({
      data: {
        id: assetId,
        documentId: input.documentId,
        kind: DocumentAssetKind.IMAGE,
        status: DocumentAssetStatus.READY,
        bucket: DOCUMENT_ASSET_BUCKET,
        objectKey,
        mimeType,
        size: input.buffer.length,
        sha256,
        originalFileName: input.fileName,
        width: null,
        height: null,
        createdBy: input.actorId,
      },
      select: documentAssetSelect,
    })

    return await this.toDocumentAsset(asset)
  }

  async uploadFile(input: {
    actorId: string
    documentId: string
    fileName: string
    mimeType: string
    buffer: Buffer
  }): Promise<DocumentAsset> {
    await this.documentAccessService.assertCanEditDocument(input.actorId, input.documentId)

    const mimeType = normalizeDocumentFileMimeType(input.mimeType)
    assertDocumentFileBuffer(input.buffer)
    const assetId = randomUUID()
    const objectKey = buildDocumentAssetObjectKey({
      documentId: input.documentId,
      assetId,
      extension: resolveDocumentFileExtension(input.fileName),
    })

    await this.storageService.putObject({
      bucket: DOCUMENT_ASSET_BUCKET,
      key: objectKey,
      body: input.buffer,
      contentType: mimeType,
      contentLength: input.buffer.length,
      contentDisposition: {
        type: 'attachment',
        fileName: input.fileName,
        fallbackFileName: 'attachment',
      },
      cacheControl: 'private, max-age=300',
    })

    const sha256 = sha256Hex(input.buffer)
    const asset = await this.prisma.documentAsset.create({
      data: {
        id: assetId,
        documentId: input.documentId,
        kind: DocumentAssetKind.FILE,
        status: DocumentAssetStatus.READY,
        bucket: DOCUMENT_ASSET_BUCKET,
        objectKey,
        mimeType,
        size: input.buffer.length,
        sha256,
        originalFileName: input.fileName,
        width: null,
        height: null,
        createdBy: input.actorId,
      },
      select: documentAssetSelect,
    })

    return await this.toDocumentAsset(asset)
  }

  async resolveAssets(input: {
    actorId: string
    documentId: string
    assetIds: string[]
  }): Promise<ResolveDocumentAssetsResponse> {
    await this.documentAccessService.assertCanReadDocument(input.actorId, input.documentId)
    return await this.resolveAssetsForScope({
      documentId: input.documentId,
      kind: 'document',
    }, input.assetIds)
  }

  async resolveSharedAssets(input: {
    actorId: string | null
    shareId: string
    documentId: string
    assetIds: string[]
  }): Promise<ResolveDocumentAssetsResponse> {
    const share = await this.documentShareRecipientsService.assertCanReadSharedDocument(
      input.actorId,
      input.shareId,
      input.documentId,
    )
    return await this.resolveAssetsForScope({
      documentId: share.documentId,
      kind: 'share',
      shareId: input.shareId,
    }, input.assetIds)
  }

  async resolveSharedRecipientAssets(input: {
    actorId: string
    recipientId: string
    documentId: string
    assetIds: string[]
  }): Promise<ResolveDocumentAssetsResponse> {
    const recipient = await this.documentShareRecipientsService.assertCanReadSharedRecipientDocument(
      input.actorId,
      input.recipientId,
      input.documentId,
    )
    return await this.resolveAssetsForScope({
      documentId: recipient.documentId,
      kind: 'recipient',
      recipientId: input.recipientId,
    }, input.assetIds)
  }

  async getAssetContent(input: {
    documentId: string
    assetId: string
    token: string
  }): Promise<StorageObject> {
    const payload = await this.verifyContentToken(input.token)

    if (payload.documentId !== input.documentId || payload.assetId !== input.assetId) {
      throw new NotFoundException('资源不存在')
    }

    const asset = await this.prisma.documentAsset.findFirst({
      where: {
        id: input.assetId,
        documentId: input.documentId,
        document: {
          trashedAt: null,
        },
        deletedAt: null,
        status: DocumentAssetStatus.READY,
      },
      select: documentAssetSelect,
    })

    if (!asset) {
      throw new NotFoundException('资源不存在')
    }

    return this.storageService.getObject({
      bucket: asset.bucket,
      key: asset.objectKey,
    })
  }

  async getSharedAssetContent(input: {
    shareId: string
    documentId: string
    assetId: string
    token: string
  }): Promise<StorageObject> {
    const payload = await this.verifySharedContentToken(input.token)

    if (payload.shareId !== input.shareId || payload.documentId !== input.documentId || payload.assetId !== input.assetId) {
      throw new NotFoundException('资源不存在')
    }

    const asset = await this.prisma.documentAsset.findFirst({
      where: {
        id: input.assetId,
        documentId: payload.documentId,
        document: {
          trashedAt: null,
        },
        deletedAt: null,
        status: DocumentAssetStatus.READY,
      },
      select: documentAssetSelect,
    })

    if (!asset) {
      throw new NotFoundException('资源不存在')
    }

    return this.storageService.getObject({
      bucket: asset.bucket,
      key: asset.objectKey,
    })
  }

  async getSharedRecipientAssetContent(input: {
    recipientId: string
    documentId: string
    assetId: string
    token: string
  }): Promise<StorageObject> {
    const payload = await this.verifySharedRecipientContentToken(input.token)

    if (payload.recipientId !== input.recipientId || payload.documentId !== input.documentId || payload.assetId !== input.assetId) {
      throw new NotFoundException('资源不存在')
    }

    const asset = await this.prisma.documentAsset.findFirst({
      where: {
        id: input.assetId,
        documentId: payload.documentId,
        document: {
          trashedAt: null,
        },
        deletedAt: null,
        status: DocumentAssetStatus.READY,
      },
      select: documentAssetSelect,
    })

    if (!asset) {
      throw new NotFoundException('资源不存在')
    }

    return this.storageService.getObject({
      bucket: asset.bucket,
      key: asset.objectKey,
    })
  }

  async assertAssetsBelongToDocument(input: {
    documentId: string
    assetIds: string[]
  }): Promise<void> {
    const uniqueAssetIds = normalizeRequestedAssetIds(input.assetIds)

    if (!uniqueAssetIds.length) {
      return
    }

    const count = await this.prisma.documentAsset.count({
      where: {
        documentId: input.documentId,
        id: {
          in: uniqueAssetIds,
        },
        document: {
          trashedAt: null,
        },
        deletedAt: null,
        status: DocumentAssetStatus.READY,
      },
    })

    if (count !== uniqueAssetIds.length) {
      throw new BadRequestException('正文中包含无效资源引用')
    }
  }

  private async resolveAssetsForScope(
    scope: DocumentAssetAccessScope,
    assetIds: string[],
  ): Promise<ResolveDocumentAssetsResponse> {
    const uniqueAssetIds = normalizeRequestedAssetIds(assetIds)

    if (!uniqueAssetIds.length) {
      return {
        assets: [],
        unresolvedAssetIds: [],
      }
    }

    const assets = await this.findReadyAssets(scope.documentId, uniqueAssetIds)
    const assetsById = new Map(assets.map(asset => [asset.id, asset]))
    const orderedAssets = uniqueAssetIds
      .map(assetId => assetsById.get(assetId))
      .filter((asset): asset is PersistedDocumentAsset => Boolean(asset))

    return {
      assets: await Promise.all(orderedAssets.map(asset => this.toDocumentAsset(asset, scope))),
      unresolvedAssetIds: uniqueAssetIds.filter(assetId => !assetsById.has(assetId)),
    }
  }

  private async findReadyAssets(documentId: string, assetIds: string[]): Promise<PersistedDocumentAsset[]> {
    return await this.prisma.documentAsset.findMany({
      where: {
        documentId,
        id: {
          in: assetIds,
        },
        document: {
          trashedAt: null,
        },
        deletedAt: null,
        status: DocumentAssetStatus.READY,
      },
      select: documentAssetSelect,
    })
  }

  private async toDocumentAsset(
    asset: PersistedDocumentAsset,
    scope: DocumentAssetAccessScope = {
      documentId: asset.documentId,
      kind: 'document',
    },
  ): Promise<DocumentAsset> {
    return {
      id: asset.id,
      documentId: asset.documentId,
      kind: toDocumentAssetKind(asset.kind),
      status: toDocumentAssetStatus(asset.status),
      mimeType: asset.mimeType,
      size: asset.size,
      fileName: asset.originalFileName,
      width: asset.width,
      height: asset.height,
      contentUrl: await this.createContentUrl(scope, asset.id),
      createdAt: asset.createdAt.toISOString(),
    }
  }

  private async createContentUrl(scope: DocumentAssetAccessScope, assetId: string): Promise<string> {
    if (scope.kind === 'share') {
      const token = await this.createSharedContentToken({
        shareId: scope.shareId!,
        documentId: scope.documentId,
        assetId,
        tokenType: DOCUMENT_SHARED_ASSET_CONTENT_TOKEN_TYPE,
      })

      return `${SERVER_PATH}/document-shares/${scope.shareId}/documents/${scope.documentId}/assets/${assetId}/content?token=${encodeURIComponent(token)}`
    }

    if (scope.kind === 'recipient') {
      const token = await this.createSharedRecipientContentToken({
        recipientId: scope.recipientId!,
        documentId: scope.documentId,
        assetId,
        tokenType: DOCUMENT_SHARED_RECIPIENT_ASSET_CONTENT_TOKEN_TYPE,
      })

      return `${SERVER_PATH}/document-share-recipients/${scope.recipientId}/documents/${scope.documentId}/assets/${assetId}/content?token=${encodeURIComponent(token)}`
    }

    const token = await this.createContentToken({
      documentId: scope.documentId,
      assetId,
      tokenType: DOCUMENT_ASSET_CONTENT_TOKEN_TYPE,
    })

    return `${SERVER_PATH}/documents/${scope.documentId}/assets/${assetId}/content?token=${encodeURIComponent(token)}`
  }

  private async createContentToken(payload: DocumentAssetContentTokenPayload): Promise<string> {
    return await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(this.jwtConfig.issuer)
      .setAudience(DOCUMENT_ASSET_CONTENT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${DOCUMENT_ASSET_CONTENT_URL_TTL_SECONDS}s`)
      .sign(this.secretKey)
  }

  private async createSharedContentToken(payload: SharedDocumentAssetContentTokenPayload): Promise<string> {
    return await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(this.jwtConfig.issuer)
      .setAudience(DOCUMENT_ASSET_CONTENT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${DOCUMENT_ASSET_CONTENT_URL_TTL_SECONDS}s`)
      .sign(this.secretKey)
  }

  private async createSharedRecipientContentToken(
    payload: SharedDocumentRecipientAssetContentTokenPayload,
  ): Promise<string> {
    return await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(this.jwtConfig.issuer)
      .setAudience(DOCUMENT_ASSET_CONTENT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${DOCUMENT_ASSET_CONTENT_URL_TTL_SECONDS}s`)
      .sign(this.secretKey)
  }

  private async verifyContentToken(token: string): Promise<DocumentAssetContentTokenPayload> {
    try {
      const { payload } = await jwtVerify<DocumentAssetContentTokenPayload>(
        token,
        this.secretKey,
        {
          issuer: this.jwtConfig.issuer,
          audience: DOCUMENT_ASSET_CONTENT_AUDIENCE,
        },
      )

      if (
        payload.tokenType !== DOCUMENT_ASSET_CONTENT_TOKEN_TYPE
        || typeof payload.documentId !== 'string'
        || typeof payload.assetId !== 'string'
      ) {
        throw new NotFoundException('资源不存在')
      }

      return payload
    }
    catch {
      throw new NotFoundException('资源不存在')
    }
  }

  private async verifySharedContentToken(token: string): Promise<SharedDocumentAssetContentTokenPayload> {
    try {
      const { payload } = await jwtVerify<SharedDocumentAssetContentTokenPayload>(
        token,
        this.secretKey,
        {
          issuer: this.jwtConfig.issuer,
          audience: DOCUMENT_ASSET_CONTENT_AUDIENCE,
        },
      )

      if (
        payload.tokenType !== DOCUMENT_SHARED_ASSET_CONTENT_TOKEN_TYPE
        || typeof payload.shareId !== 'string'
        || typeof payload.documentId !== 'string'
        || typeof payload.assetId !== 'string'
      ) {
        throw new NotFoundException('资源不存在')
      }

      return payload
    }
    catch {
      throw new NotFoundException('资源不存在')
    }
  }

  private async verifySharedRecipientContentToken(
    token: string,
  ): Promise<SharedDocumentRecipientAssetContentTokenPayload> {
    try {
      const { payload } = await jwtVerify<SharedDocumentRecipientAssetContentTokenPayload>(
        token,
        this.secretKey,
        {
          issuer: this.jwtConfig.issuer,
          audience: DOCUMENT_ASSET_CONTENT_AUDIENCE,
        },
      )

      if (
        payload.tokenType !== DOCUMENT_SHARED_RECIPIENT_ASSET_CONTENT_TOKEN_TYPE
        || typeof payload.recipientId !== 'string'
        || typeof payload.documentId !== 'string'
        || typeof payload.assetId !== 'string'
      ) {
        throw new NotFoundException('资源不存在')
      }

      return payload
    }
    catch {
      throw new NotFoundException('资源不存在')
    }
  }
}

function assertDocumentImageMimeType(mimeType: string): DocumentImageMimeType {
  const normalizedMimeType = mimeType.trim().toLowerCase()

  if (normalizedMimeType in DOCUMENT_IMAGE_EXTENSION_MAP) {
    return normalizedMimeType as DocumentImageMimeType
  }

  throw new BadRequestException('图片仅支持 JPG、PNG、WEBP、GIF 格式')
}

function assertDocumentImageBuffer(buffer: Buffer, mimeType: DocumentImageMimeType): void {
  if (!buffer.length) {
    throw new BadRequestException('图片文件不能为空')
  }

  if (buffer.length > DOCUMENT_IMAGE_MAX_SIZE_BYTES) {
    throw new BadRequestException('图片大小不能超过 15MB')
  }

  if (!isDocumentImageSignatureMatched(buffer, mimeType)) {
    throw new BadRequestException('图片文件格式不正确')
  }
}

function assertDocumentFileBuffer(buffer: Buffer): void {
  if (!buffer.length) {
    throw new BadRequestException('附件文件不能为空')
  }

  if (buffer.length > DOCUMENT_FILE_MAX_SIZE_BYTES) {
    throw new BadRequestException('附件大小不能超过 50MB')
  }
}

function isDocumentImageSignatureMatched(buffer: Buffer, mimeType: DocumentImageMimeType): boolean {
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF
  }

  if (mimeType === 'image/png') {
    return buffer.length >= 8
      && buffer[0] === 0x89
      && buffer[1] === 0x50
      && buffer[2] === 0x4E
      && buffer[3] === 0x47
      && buffer[4] === 0x0D
      && buffer[5] === 0x0A
      && buffer[6] === 0x1A
      && buffer[7] === 0x0A
  }

  if (mimeType === 'image/gif') {
    return buffer.length >= 6
      && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))
  }

  return buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
}

function buildDocumentAssetObjectKey(input: {
  documentId: string
  assetId: string
  extension: string
}) {
  return `documents/${input.documentId}/${input.assetId}.${input.extension}`
}

function normalizeRequestedAssetIds(assetIds: string[]): string[] {
  return Array.from(
    new Set(
      assetIds
        .map(assetId => assetId.trim())
        .filter(assetId => assetId.length > 0),
    ),
  )
}

function normalizeDocumentFileMimeType(mimeType: string): string {
  const normalizedMimeType = mimeType.trim().toLowerCase()
  return normalizedMimeType || 'application/octet-stream'
}

function resolveDocumentFileExtension(fileName: string): string {
  const rawExtension = extname(fileName).replace(DOCUMENT_FILE_EXTENSION_PREFIX, '').trim().toLowerCase()

  if (DOCUMENT_FILE_EXTENSION_PATTERN.test(rawExtension)) {
    return rawExtension
  }

  return 'bin'
}

function toDocumentAssetKind(kind: DocumentAssetKind): DocumentAsset['kind'] {
  return kind.toLowerCase() as DocumentAsset['kind']
}

function toDocumentAssetStatus(status: DocumentAssetStatus): DocumentAsset['status'] {
  return status.toLowerCase() as DocumentAsset['status']
}
