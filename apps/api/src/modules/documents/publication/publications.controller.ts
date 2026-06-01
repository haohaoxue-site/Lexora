import type {
  CreatePublicationPageRequest,
  CreatePublicationSectionRequest,
  DocumentSinglePublicationInfo,
  ListDocumentSinglePublicationsQuery,
  ListDocumentSinglePublicationsResponse,
  PublicationSingleDocumentResponse,
  PublicationSiteManagementResponse,
  PublicationSiteRenderResponse,
  ReplacePublicationNavItemsRequest,
  ResolveDocumentAssetsRequest,
  ResolveDocumentAssetsResponse,
  UpdateDocumentSinglePublicationSettingRequest,
  UpdatePublicationPageRequest,
  UpdatePublicationSectionRequest,
  UpsertPublicationSiteSettingsRequest,
} from '@haohaoxue/samepage-contracts'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AuthUserContext } from '../../auth/auth.interface'
import {
  CreatePublicationPageSchema,
  CreatePublicationSectionSchema,
  ListDocumentSinglePublicationsQuerySchema,
  ReplacePublicationNavItemsSchema,
  ResolveDocumentAssetsSchema,
  UpdateDocumentSinglePublicationSettingSchema,
  UpdatePublicationPageSchema,
  UpdatePublicationSectionSchema,
  UpsertPublicationSiteSettingsSchema,
} from '@haohaoxue/samepage-contracts'
import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, Res } from '@nestjs/common'
import { CurrentUser } from '../../../decorators/current-user.decorator'
import { Public } from '../../../decorators/public.decorator'
import { ZodValidationPipe } from '../../../pipes/zod-validation.pipe'
import { DocumentAssetsService } from '../asset/asset.service'
import { DocumentPublicationsService } from './publications.service'

@Controller()
export class DocumentPublicationsController {
  constructor(
    private readonly publicationsService: DocumentPublicationsService,
    private readonly documentAssetsService: DocumentAssetsService,
  ) {}

  @Get('documents/publications/single')
  async listSinglePublicationTree(
    @CurrentUser() authUser: AuthUserContext,
    @Query(new ZodValidationPipe(ListDocumentSinglePublicationsQuerySchema)) query: ListDocumentSinglePublicationsQuery,
  ): Promise<ListDocumentSinglePublicationsResponse> {
    return this.publicationsService.listSinglePublicationTree(authUser.id, query.workspaceId)
  }

  @Get('documents/:documentId/single-publication')
  async getSinglePublicationSetting(
    @CurrentUser() authUser: AuthUserContext,
    @Param('documentId') documentId: string,
  ): Promise<DocumentSinglePublicationInfo> {
    return this.publicationsService.getSinglePublicationSetting(authUser.id, documentId)
  }

  @Put('documents/:documentId/single-publication')
  async updateSinglePublicationSetting(
    @CurrentUser() authUser: AuthUserContext,
    @Param('documentId') documentId: string,
    @Body(new ZodValidationPipe(UpdateDocumentSinglePublicationSettingSchema)) payload: UpdateDocumentSinglePublicationSettingRequest,
  ): Promise<DocumentSinglePublicationInfo> {
    return this.publicationsService.updateSinglePublicationSetting(authUser.id, documentId, payload)
  }

  @Public()
  @Get('p/:documentId')
  async getSinglePublicDocument(
    @Param('documentId') documentId: string,
  ): Promise<PublicationSingleDocumentResponse> {
    return this.publicationsService.getSinglePublicDocument(documentId)
  }

  @Public()
  @Post('p/:documentId/assets/resolve')
  async resolveSinglePublicationDocumentAssets(
    @Param('documentId') documentId: string,
    @Body(new ZodValidationPipe(ResolveDocumentAssetsSchema)) payload: ResolveDocumentAssetsRequest,
    @Res({ passthrough: true }) response: FastifyReply,
  ): Promise<ResolveDocumentAssetsResponse> {
    const result = await this.documentAssetsService.resolveSinglePublicationAssets({
      documentId,
      assetIds: payload.assetIds,
    })
    response.header('set-cookie', await this.documentAssetsService.buildSinglePublicationAssetAccessCookie(documentId))
    return result
  }

  @Public()
  @Get('p/:documentId/assets/:assetId/content')
  async getSinglePublicationDocumentAssetContent(
    @Param('documentId') documentId: string,
    @Param('assetId') assetId: string,
    @Req() request: FastifyRequest,
    @Res() response: FastifyReply,
  ): Promise<FastifyReply> {
    const asset = await this.documentAssetsService.getSinglePublicationAssetContent({
      documentId,
      assetId,
      cookieHeader: request.headers.cookie,
    })

    response.header('cache-control', 'private, max-age=300')
    response.header('content-type', asset.contentType)

    if (asset.contentLength !== null) {
      response.header('content-length', String(asset.contentLength))
    }

    return response.send(asset.body)
  }

  @Get('documents/publications/site')
  async getPublicationSiteManagement(
    @CurrentUser() authUser: AuthUserContext,
    @Query(new ZodValidationPipe(ListDocumentSinglePublicationsQuerySchema)) query: ListDocumentSinglePublicationsQuery,
  ): Promise<PublicationSiteManagementResponse> {
    return this.publicationsService.getPublicationSiteManagement(authUser.id, query.workspaceId)
  }

  @Put('documents/publications/site')
  async updatePublicationSiteSettings(
    @CurrentUser() authUser: AuthUserContext,
    @Body(new ZodValidationPipe(UpsertPublicationSiteSettingsSchema)) payload: UpsertPublicationSiteSettingsRequest,
  ): Promise<PublicationSiteManagementResponse> {
    return this.publicationsService.updatePublicationSiteSettings(authUser.id, payload)
  }

  @Post('documents/publications/site/sections')
  async createPublicationSection(
    @CurrentUser() authUser: AuthUserContext,
    @Body(new ZodValidationPipe(CreatePublicationSectionSchema)) payload: CreatePublicationSectionRequest,
  ): Promise<PublicationSiteManagementResponse> {
    return this.publicationsService.createPublicationSection(authUser.id, payload)
  }

  @Put('documents/publications/site/sections/:sectionId')
  async updatePublicationSection(
    @CurrentUser() authUser: AuthUserContext,
    @Param('sectionId') sectionId: string,
    @Body(new ZodValidationPipe(UpdatePublicationSectionSchema)) payload: UpdatePublicationSectionRequest,
  ): Promise<PublicationSiteManagementResponse> {
    return this.publicationsService.updatePublicationSection(authUser.id, sectionId, payload)
  }

  @Delete('documents/publications/site/sections/:sectionId')
  async removePublicationSection(
    @CurrentUser() authUser: AuthUserContext,
    @Param('sectionId') sectionId: string,
    @Query(new ZodValidationPipe(ListDocumentSinglePublicationsQuerySchema)) query: ListDocumentSinglePublicationsQuery,
  ): Promise<PublicationSiteManagementResponse> {
    return this.publicationsService.removePublicationSection(authUser.id, query.workspaceId, sectionId)
  }

  @Post('documents/publications/site/pages')
  async createPublicationPage(
    @CurrentUser() authUser: AuthUserContext,
    @Body(new ZodValidationPipe(CreatePublicationPageSchema)) payload: CreatePublicationPageRequest,
  ): Promise<PublicationSiteManagementResponse> {
    return this.publicationsService.createPublicationPage(authUser.id, payload)
  }

  @Put('documents/publications/site/pages/:pageId')
  async updatePublicationPage(
    @CurrentUser() authUser: AuthUserContext,
    @Param('pageId') pageId: string,
    @Body(new ZodValidationPipe(UpdatePublicationPageSchema)) payload: UpdatePublicationPageRequest,
  ): Promise<PublicationSiteManagementResponse> {
    return this.publicationsService.updatePublicationPage(authUser.id, pageId, payload)
  }

  @Delete('documents/publications/site/pages/:pageId')
  async removePublicationPage(
    @CurrentUser() authUser: AuthUserContext,
    @Param('pageId') pageId: string,
    @Query(new ZodValidationPipe(ListDocumentSinglePublicationsQuerySchema)) query: ListDocumentSinglePublicationsQuery,
  ): Promise<PublicationSiteManagementResponse> {
    return this.publicationsService.removePublicationPage(authUser.id, query.workspaceId, pageId)
  }

  @Put('documents/publications/site/nav-items')
  async replacePublicationNavItems(
    @CurrentUser() authUser: AuthUserContext,
    @Body(new ZodValidationPipe(ReplacePublicationNavItemsSchema)) payload: ReplacePublicationNavItemsRequest,
  ): Promise<PublicationSiteManagementResponse> {
    return this.publicationsService.replacePublicationNavItems(authUser.id, payload)
  }

  @Public()
  @Get('s/:siteId')
  async getSiteHome(
    @Param('siteId') siteId: string,
  ): Promise<PublicationSiteRenderResponse> {
    return this.publicationsService.getSitePublicPage(siteId)
  }

  @Public()
  @Get('s/:siteId/:documentId')
  async getSiteDocument(
    @Param('siteId') siteId: string,
    @Param('documentId') documentId: string,
  ): Promise<PublicationSiteRenderResponse> {
    return this.publicationsService.getSitePublicPage(siteId, documentId)
  }

  @Public()
  @Post('publications/:publicationId/documents/:documentId/assets/resolve')
  async resolvePublicationDocumentAssets(
    @Param('publicationId') publicationId: string,
    @Param('documentId') documentId: string,
    @Body(new ZodValidationPipe(ResolveDocumentAssetsSchema)) payload: ResolveDocumentAssetsRequest,
    @Res({ passthrough: true }) response: FastifyReply,
  ): Promise<ResolveDocumentAssetsResponse> {
    const result = await this.documentAssetsService.resolvePublicationAssets({
      publicationId,
      documentId,
      assetIds: payload.assetIds,
    })
    response.header('set-cookie', await this.documentAssetsService.buildAssetAccessCookie({
      kind: 'publication',
      publicationId,
      documentId,
      actorId: null,
    }))
    return result
  }

  @Public()
  @Get('publications/:publicationId/documents/:documentId/assets/:assetId/content')
  async getPublicationDocumentAssetContent(
    @Param('publicationId') publicationId: string,
    @Param('documentId') documentId: string,
    @Param('assetId') assetId: string,
    @Req() request: FastifyRequest,
    @Res() response: FastifyReply,
  ): Promise<FastifyReply> {
    const asset = await this.documentAssetsService.getPublicationAssetContent({
      publicationId,
      documentId,
      assetId,
      cookieHeader: request.headers.cookie,
    })

    response.header('cache-control', 'private, max-age=300')
    response.header('content-type', asset.contentType)

    if (asset.contentLength !== null) {
      response.header('content-length', String(asset.contentLength))
    }

    return response.send(asset.body)
  }
}
