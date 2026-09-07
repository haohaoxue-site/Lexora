import type { BuddyUserContentV1 } from '../../../shared/buddyUserContent'
import type {
  BuddyArtifactSource,
  BuddyComposerResource,
  BuddyComposerResourceAccept,
  BuddyComposerResourceComplete,
  BuddyComposerResourceTarget,
  BuddyComposerSource,
  BuddyComposerSourceList,
  BuddyComposerSourceListResponse,
  BuddyComposerSourceOption,
  BuddyComposerSourceOrigin,
  BuddyComposerSourceSelect,
  BuddyComposerSpaceFileSelect,
  BuddyMessageInputSource,
  BuddySpaceFileOrigin,
  BuddySpaceFileSource,
} from '../../../shared/composerResource'
import type { ArtifactResource, ArtifactService } from '../artifacts/ArtifactService'
import type { RunEventReader } from '../events/RunEventPorts'
import type { SpaceService } from '../spaces/SpaceService'
import type { AttachmentRecord } from '../storage/attachmentRepository'
import type { ComposerDraftRepository } from '../storage/composerDraftRepository'
import type { ComposerResourceRecord, ComposerResourceRepository } from '../storage/composerResourceRepository'
import type { ConversationDirectoryGrantRepository } from '../storage/conversationDirectoryGrantRepository'
import type { ConversationRepository } from '../storage/conversationRepository'
import type { SpaceRepository } from '../storage/spaceRepository'
import type { AttachmentService } from './AttachmentService'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { open, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, relative } from 'node:path'
import { PhotonImage } from '@silvia-odwyer/photon-node'
import { BUDDY_ATTACHMENT_COUNT_LIMIT, BUDDY_ATTACHMENT_TOTAL_BYTES_LIMIT } from '../../../shared/attachmentPolicy'
import { getBuddyUserContentResourceIds } from '../../../shared/buddyUserContent'
import { buddyComposerResourceAcceptSchema, buddyComposerSourceListSchema, buddyComposerSourceSelectSchema, buddyComposerSpaceFileSelectSchema } from '../../../shared/composerResource'
import { buddyRunOutputPayloadSchema } from '../../../shared/runOutput'
import { resolveGrantedPath } from '../directories/resolveGrantedPath'
import { createSensitivePathMatcher } from '../permissions/sensitivePaths'
import { readBoundedFile } from '../resources/BoundedFileReader'
import { BuddyServiceError } from '../rpc/runtimeRequest'
import { requireActiveSpace } from '../spaces/requireActiveSpace'
import { ComposerResourceConflictError } from '../storage/composerResourceRepository'
import { AttachmentError, DRAFT_ATTACHMENT_RETENTION_MS, normalizeAttachmentMetadata } from './AttachmentService'

export interface ComposerResourceServiceOptions {
  artifacts?: Pick<ArtifactService, 'listConversationArtifacts' | 'resolveConversationArtifactLocation'>
  attachments: Pick<AttachmentService, 'cleanupDrafts' | 'listForConversation' | 'registerFiles' | 'registerUploads' | 'release'>
  conversationGrants?: Pick<ConversationDirectoryGrantRepository, 'listActive'>
  conversations?: Pick<ConversationRepository, 'findById' | 'listBranchMessages'>
  drafts?: Pick<ComposerDraftRepository, 'findById'>
  eventLog?: Pick<RunEventReader, 'listForRuns'>
  repository: ComposerResourceRepository
  spaceFiles?: Pick<SpaceService, 'searchFiles'>
  spaces?: Pick<SpaceRepository, 'findById'>
}

export interface ComposerSourceScope {
  branchId: string | null
  conversationId: string | null
  spaceId: string | null
}

export class ComposerResourceService {
  readonly #attachments: ComposerResourceServiceOptions['attachments']
  readonly #artifacts: ComposerResourceServiceOptions['artifacts']
  readonly #conversationGrants: ComposerResourceServiceOptions['conversationGrants']
  readonly #conversations: ComposerResourceServiceOptions['conversations']
  readonly #drafts: ComposerResourceServiceOptions['drafts']
  readonly #eventLog: ComposerResourceServiceOptions['eventLog']
  readonly #repository: ComposerResourceRepository
  readonly #importing = new Set<string>()
  readonly #spaces: ComposerResourceServiceOptions['spaces']
  readonly #spaceFiles: ComposerResourceServiceOptions['spaceFiles']
  readonly #sensitivePaths = createSensitivePathMatcher()

  constructor(options: ComposerResourceServiceOptions) {
    this.#attachments = options.attachments
    this.#artifacts = options.artifacts
    this.#conversationGrants = options.conversationGrants
    this.#conversations = options.conversations
    this.#drafts = options.drafts
    this.#eventLog = options.eventLog
    this.#repository = options.repository
    this.#spaces = options.spaces
    this.#spaceFiles = options.spaceFiles
  }

  accept(input: BuddyComposerResourceAccept): BuddyComposerResource[] {
    const parsed = buddyComposerResourceAcceptSchema.parse(input)
    const resources = parsed.resources.map(resource => ({
      ...normalizeAttachmentMetadata(resource),
      resourceId: resource.resourceId,
    }))
    try {
      return this.#repository.accept(input.draftId, resources, new Date().toISOString()).map(toPublicResource)
    }
    catch (error) {
      if (error instanceof ComposerResourceConflictError)
        throw new AttachmentError('VALIDATION_FAILED', { cause: error })
      throw error
    }
  }

  list(draftId: string): BuddyComposerResource[] {
    return this.#repository.listForDraft(draftId).map(toPublicResource)
  }

  async selectSpaceFile(
    input: BuddyComposerSpaceFileSelect,
    referencedResourceIds: readonly string[] = [],
  ): Promise<BuddyComposerResource> {
    const parsed = buddyComposerSpaceFileSelectSchema.parse(input)
    const { source, metadata } = await this.#resolveSpaceFile(parsed.source)
    this.#assertCapacity(parsed.draftId, referencedResourceIds, [metadata])
    return toPublicResource(this.#repository.selectSpaceFile(parsed.draftId, {
      ...metadata,
      resourceId: parsed.resourceId,
    }, source, new Date().toISOString()))
  }

  async listSources(input: BuddyComposerSourceList): Promise<BuddyComposerSourceListResponse> {
    const parsed = buddyComposerSourceListSchema.parse(input)
    const scope = this.#resolveScope(parsed)
    const [spaceFiles, conversationFiles] = await Promise.all([
      this.#listSpaceSources(scope.spaceId, parsed.query),
      this.#listConversationSources(scope, parsed.query),
    ])
    return { files: [...spaceFiles, ...conversationFiles].slice(0, 128) }
  }

  async selectSource(
    input: BuddyComposerSourceSelect,
    referencedResourceIds: readonly string[] = [],
  ): Promise<BuddyComposerResource> {
    const parsed = buddyComposerSourceSelectSchema.parse(input)
    const resolved = await this.#resolveSource(parsed.source)
    this.#assertCapacity(parsed.draftId, referencedResourceIds, [resolved.metadata])
    return toPublicResource(this.#repository.selectSource(parsed.draftId, {
      ...resolved.metadata,
      resourceId: parsed.resourceId,
    }, resolved.source, new Date().toISOString()))
  }

  async selectSpaceFilePath(draftId: string, spaceId: string, path: string): Promise<BuddyComposerResource> {
    const space = requireActiveSpace(this.#spaces?.findById(spaceId) ?? null)
    const bindings = [space.primaryDirectory, ...space.additionalDirectories].filter(binding => binding !== null)
    const requestedPath = isAbsolute(path) ? path : space.primaryDirectory ? join(space.primaryDirectory.canonicalRoot, path) : null
    if (!requestedPath)
      throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
    const resolution = await resolveGrantedPath(bindings.map(binding => ({ canonicalRoot: binding.canonicalRoot, grantId: binding.id, kind: 'workspace', root: binding.root })), requestedPath, 'existing')
    const binding = bindings.find(binding => binding.id === resolution.grantId)!
    return this.selectSpaceFile({ draftId, resourceId: randomUUID(), source: { spaceId, bindingId: binding.id, relativePath: relative(binding.canonicalRoot, resolution.canonicalPath) } })
  }

  async resolveInput(draftId: string, content: BuddyUserContentV1, scope: ComposerSourceScope = { branchId: null, conversationId: null, spaceId: null }): Promise<{ attachmentId: string, resourceId: string }[]> {
    const resourceIds = getBuddyUserContentResourceIds(content)
    if (resourceIds.length > BUDDY_ATTACHMENT_COUNT_LIMIT)
      throw new AttachmentError('VALIDATION_FAILED')
    const resources = resourceIds.map((resourceId) => {
      const resource = this.#requireOwned({ draftId, resourceId })
      if (resource.state !== 'ready')
        throw new AttachmentError('VALIDATION_FAILED')
      if (resource.source && 'spaceId' in resource.source && resource.source.spaceId !== scope.spaceId)
        throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
      if (resource.source && 'conversationId' in resource.source && resource.source.conversationId !== scope.conversationId)
        throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
      return resource
    })
    const result: { attachmentId: string, resourceId: string }[] = []
    let totalBytes = 0
    for (const resource of resources) {
      if (!resource.source) {
        totalBytes += resource.sizeBytes
        result.push({ attachmentId: resource.attachmentId!, resourceId: resource.resourceId })
        continue
      }
      const resolved = await this.#resolveSourceOrigin(resource.source, scope)
      totalBytes += resolved.metadata.sizeBytes
      if (totalBytes > BUDDY_ATTACHMENT_TOTAL_BYTES_LIMIT)
        throw new AttachmentError('VALIDATION_FAILED')
      if (resolved.attachmentId) {
        result.push({ attachmentId: resolved.attachmentId, resourceId: resource.resourceId })
      }
      else {
        validateResourceBytes(resolved.metadata, resolved.bytes)
        const [attachment] = await this.#attachments.registerUploads(draftId, [{ ...resolved.metadata, bytes: Uint8Array.from(resolved.bytes) }])
        if (!attachment)
          throw new AttachmentError('ATTACHMENT_NOT_FOUND')
        result.push({ attachmentId: attachment.id, resourceId: resource.resourceId })
      }
    }
    if (totalBytes > BUDDY_ATTACHMENT_TOTAL_BYTES_LIMIT)
      throw new AttachmentError('VALIDATION_FAILED')
    return result
  }

  #resolveScope(input: BuddyComposerSourceList): ComposerSourceScope {
    if ((input.conversationId === null) !== (input.branchId === null))
      throw new BuddyServiceError('VALIDATION_FAILED')
    if (!input.conversationId)
      return { branchId: null, conversationId: null, spaceId: input.spaceId }
    const conversation = this.#conversations?.findById(input.conversationId)
    if (!conversation || conversation.deletedAt !== null || conversation.activeBranchId !== input.branchId)
      throw new BuddyServiceError('VALIDATION_FAILED')
    if (conversation.spaceId !== input.spaceId)
      throw new BuddyServiceError('VALIDATION_FAILED')
    this.#conversations!.listBranchMessages(conversation.id, input.branchId!)
    return { branchId: input.branchId, conversationId: conversation.id, spaceId: conversation.spaceId }
  }

  async #listSpaceSources(spaceId: string | null, query: string): Promise<BuddyComposerSourceOption[]> {
    if (!spaceId || !this.#spaceFiles)
      return []
    const files = await this.#spaceFiles.searchFiles(spaceId, query)
    const resolved = await Promise.all(files.map(async (file) => {
      try {
        const source = { bindingId: file.directoryId, relativePath: file.relativePath, spaceId }
        const value = await this.#resolveSpaceFile(source)
        return {
          category: 'space' as const,
          description: `${file.root} · ${file.relativePath}`,
          label: value.metadata.name,
          ...value.metadata,
          path: file.path,
          source,
        }
      }
      catch {
        return null
      }
    }))
    return resolved.filter((value): value is NonNullable<typeof value> => value !== null)
  }

  async #listConversationSources(scope: ComposerSourceScope, query: string): Promise<BuddyComposerSourceOption[]> {
    if (!scope.conversationId || !scope.branchId)
      return []
    const history = this.#requireVisibleHistory(scope.conversationId, scope.branchId)
    const attachmentsByMessageId = new Map<string, AttachmentRecord[]>()
    for (const attachment of this.#attachments.listForConversation(scope.conversationId)) {
      if (!attachment.messageId)
        continue
      const messageAttachments = attachmentsByMessageId.get(attachment.messageId) ?? []
      messageAttachments.push(attachment)
      attachmentsByMessageId.set(attachment.messageId, messageAttachments)
    }
    const historical = history.flatMap((message): BuddyComposerSourceOption[] => {
      if (message.role !== 'user')
        return []
      return (attachmentsByMessageId.get(message.id) ?? []).flatMap((attachment) => {
        try {
          const metadata = normalizeAttachmentMetadata(attachment)
          return [{
            category: 'history',
            description: message.createdAt,
            label: metadata.name,
            ...metadata,
            path: null,
            source: {
              branchId: scope.branchId!,
              conversationId: scope.conversationId!,
              messageId: message.id,
              attachmentId: attachment.id,
            },
          }]
        }
        catch {
          return []
        }
      }) ?? []
    })
    const visibleArtifactIds = this.#visibleArtifactIds(history)
    const artifacts = (await Promise.all((this.#artifacts?.listConversationArtifacts(scope.conversationId) ?? []).map(async (artifact): Promise<BuddyComposerSourceOption | null> => {
      if (artifact.kind !== 'file' || !visibleArtifactIds.has(artifact.id))
        return null
      const source = {
        artifactId: artifact.id,
        branchId: scope.branchId!,
        conversationId: scope.conversationId!,
      }
      try {
        await this.#validateArtifactGrant(source)
        const metadata = normalizeAttachmentMetadata(artifact)
        return {
          category: 'artifact',
          description: artifact.relativePath,
          label: metadata.name,
          ...metadata,
          path: artifact.relativePath,
          source,
        }
      }
      catch {
        return null
      }
    }))).filter((value): value is BuddyComposerSourceOption => value !== null)
    const normalizedQuery = query.toLowerCase()
    return [...historical, ...artifacts].filter(option => [option.label, option.path, option.description]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(normalizedQuery))
  }

  async #resolveSource(source: BuddyComposerSource): Promise<{
    metadata: ReturnType<typeof normalizeAttachmentMetadata>
    source: BuddyComposerSourceOrigin
  }> {
    if ('artifactId' in source) {
      this.#requireVisibleArtifact(source)
      const { artifact } = await this.#validateArtifactGrant(source)
      if (!artifact || artifact.kind !== 'file')
        throw new AttachmentError('ATTACHMENT_NOT_FOUND')
      return { metadata: normalizeAttachmentMetadata(artifact), source }
    }
    if ('messageId' in source) {
      const attachment = this.#resolveMessageInput(source)
      return { metadata: normalizeAttachmentMetadata(attachment), source }
    }
    return this.#resolveSpaceFile(source)
  }

  async #resolveSourceOrigin(source: BuddyComposerSourceOrigin, scope: ComposerSourceScope): Promise<{
    attachmentId: string | null
    bytes: Uint8Array
    metadata: ReturnType<typeof normalizeAttachmentMetadata>
  }> {
    if ('artifactId' in source) {
      if (scope.branchId !== source.branchId)
        throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
      this.#requireVisibleArtifact(source)
      const resolved = await this.#validateArtifactGrant(source)
      const bytes = await readBoundedFile(
        resolved.root,
        resolved.path,
        BUDDY_ATTACHMENT_TOTAL_BYTES_LIMIT + 1,
      )
      const metadata = normalizeAttachmentMetadata({
        ...resolved.artifact,
        sizeBytes: bytes.byteLength,
      })
      return { attachmentId: null, bytes: Uint8Array.from(bytes), metadata }
    }
    if ('messageId' in source) {
      if (scope.branchId !== source.branchId)
        throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
      const attachment = this.#resolveMessageInput(source)
      return { attachmentId: attachment.id, bytes: new Uint8Array(), metadata: normalizeAttachmentMetadata(attachment) }
    }
    const resolved = await this.#resolveSpaceFile(source)
    if (resolved.source.bindingRevision !== source.bindingRevision)
      throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
    const bytes = await readBoundedFile(resolved.root, resolved.path, resolved.metadata.sizeBytes + 1)
    return { attachmentId: null, bytes: Uint8Array.from(bytes), metadata: resolved.metadata }
  }

  #resolveMessageInput(source: BuddyMessageInputSource): AttachmentRecord {
    const message = this.#requireVisibleHistory(source.conversationId, source.branchId)
      .find(item => item.id === source.messageId)
    const attachment = this.#attachments.listForConversation(source.conversationId)
      .find(item => item.id === source.attachmentId)
    if (!message || message.role !== 'user' || !attachment || attachment.messageId !== message.id)
      throw new AttachmentError('ATTACHMENT_NOT_FOUND')
    return attachment
  }

  #requireVisibleHistory(conversationId: string, branchId: string) {
    const conversation = this.#conversations?.findById(conversationId)
    if (!conversation || conversation.deletedAt !== null || conversation.activeBranchId !== branchId)
      throw new BuddyServiceError('VALIDATION_FAILED')
    return this.#conversations!.listBranchMessages(conversationId, branchId)
  }

  #visibleArtifactIds(history: ReturnType<NonNullable<ComposerResourceServiceOptions['conversations']>['listBranchMessages']>): Set<string> {
    const runIds = history.flatMap(message => message.runId ? [message.runId] : [])
    return new Set((this.#eventLog?.listForRuns(runIds) ?? []).flatMap((event) => {
      if (event.type !== 'output.produced')
        return []
      const output = buddyRunOutputPayloadSchema.safeParse(event.payload)
      return output.success ? output.data.artifactIds : []
    }))
  }

  #requireVisibleArtifact(source: BuddyArtifactSource): void {
    const history = this.#requireVisibleHistory(source.conversationId, source.branchId)
    if (!this.#visibleArtifactIds(history).has(source.artifactId))
      throw new AttachmentError('ATTACHMENT_NOT_FOUND')
  }

  async #validateArtifactGrant(source: BuddyArtifactSource): Promise<{
    artifact: ArtifactResource
    path: string
    root: string
  }> {
    const location = this.#artifacts?.resolveConversationArtifactLocation(
      source.conversationId,
      source.artifactId,
    )
    const artifact = location?.resource
    const conversation = this.#conversations?.findById(source.conversationId)
    if (!artifact || !conversation)
      throw new AttachmentError('ATTACHMENT_NOT_FOUND')
    const grants = conversation.spaceId
      ? (() => {
          const space = requireActiveSpace(this.#spaces?.findById(conversation.spaceId) ?? null)
          return [space.primaryDirectory, ...space.additionalDirectories]
        })()
          .filter(grant => grant !== null)
      : this.#conversationGrants?.listActive(conversation.id) ?? []
    const grant = grants.find(item => item.id === artifact.directoryGrantId) ?? (
      !conversation.spaceId && artifact.directoryGrantId === conversation.id
        ? {
            canonicalRoot: location.canonicalRoot,
            id: conversation.id,
            root: location.canonicalRoot,
          }
        : null
    )
    if (!grant)
      throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
    if (grant.canonicalRoot !== location.canonicalRoot)
      throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
    const resolution = await resolveGrantedPath(
      [{ canonicalRoot: grant.canonicalRoot, grantId: grant.id, kind: 'workspace', root: grant.root }],
      join(grant.canonicalRoot, artifact.relativePath),
      'existing',
    )
    if (resolution.canonicalPath !== location.canonicalPath)
      throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
    return {
      artifact,
      path: resolution.canonicalPath,
      root: grant.canonicalRoot,
    }
  }

  async #resolveSpaceFile(source: BuddySpaceFileSource): Promise<{
    metadata: ReturnType<typeof normalizeAttachmentMetadata>
    path: string
    root: string
    source: BuddySpaceFileOrigin
  }> {
    const space = requireActiveSpace(this.#spaces?.findById(source.spaceId) ?? null)
    const binding = [space.primaryDirectory, ...space.additionalDirectories].find(directory => directory?.id === source.bindingId)
    if (!binding || binding.revokedAt || isAbsolute(source.relativePath))
      throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
    const resolution = await resolveGrantedPath([{
      canonicalRoot: binding.canonicalRoot,
      grantId: binding.id,
      kind: 'workspace',
      root: binding.root,
    }], join(binding.canonicalRoot, source.relativePath), 'existing')
    if (this.#sensitivePaths.matches(resolution.canonicalPath))
      throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
    const info = await stat(resolution.canonicalPath)
    if (!info.isFile())
      throw new AttachmentError('VALIDATION_FAILED')
    const metadata = normalizeAttachmentMetadata({ name: basename(resolution.canonicalPath), mimeType: '', sizeBytes: info.size })
    return {
      metadata,
      path: resolution.canonicalPath,
      root: binding.canonicalRoot,
      source: { bindingId: binding.id, bindingRevision: binding.revision, relativePath: relative(binding.canonicalRoot, resolution.canonicalPath), spaceId: space.id },
    }
  }

  async complete(input: BuddyComposerResourceComplete): Promise<BuddyComposerResource> {
    const resource = this.#requireOwned(input)
    if (resource.source)
      throw new AttachmentError('VALIDATION_FAILED')
    const contentHash = createHash('sha256').update(input.bytes).digest('hex')
    if (resource.state === 'ready') {
      if (resource.contentHash !== contentHash)
        throw new AttachmentError('VALIDATION_FAILED')
      return toPublicResource(resource)
    }
    if (resource.state !== 'importing' || this.#importing.has(input.resourceId))
      throw new AttachmentError('VALIDATION_FAILED')

    this.#importing.add(input.resourceId)
    try {
      validateResourceBytes(resource, input.bytes)
      const [attachment] = await this.#attachments.registerUploads(input.draftId, [{
        bytes: input.bytes,
        mimeType: resource.mimeType,
        name: resource.name,
      }])
      if (!attachment)
        throw new AttachmentError('ATTACHMENT_NOT_FOUND')
      if (!this.#repository.finish({
        attachmentId: attachment.id,
        contentHash,
        draftId: input.draftId,
        now: new Date().toISOString(),
        resourceId: input.resourceId,
      })) {
        await this.#attachments.release([attachment.id])
        throw new AttachmentError('VALIDATION_FAILED')
      }
      return toPublicResource(this.#requireOwned(input))
    }
    catch {
      return this.fail(input)
    }
    finally {
      this.#importing.delete(input.resourceId)
    }
  }

  fail(input: BuddyComposerResourceTarget): BuddyComposerResource {
    this.#requireOwned(input)
    this.#repository.fail(input.draftId, input.resourceId, 'IMPORT_FAILED', new Date().toISOString())
    return toPublicResource(this.#requireOwned(input))
  }

  retry(input: BuddyComposerResourceTarget): BuddyComposerResource {
    this.#requireOwned(input)
    if (this.#importing.has(input.resourceId))
      throw new AttachmentError('VALIDATION_FAILED')
    this.#repository.retry(input.draftId, input.resourceId, new Date().toISOString())
    return toPublicResource(this.#requireOwned(input))
  }

  async registerFiles(input: {
    draftId: string
    paths: readonly string[]
    referencedResourceIds?: readonly string[]
  }): Promise<BuddyComposerResource[]> {
    const { draftId, paths, referencedResourceIds = [] } = input
    if (!paths.length)
      return []
    const capacity = this.#remainingCapacity(draftId, referencedResourceIds)
    if (paths.length > capacity.count)
      throw new AttachmentError('ATTACHMENT_LIMIT_EXCEEDED')
    const attachments = await this.#attachments.registerFiles(draftId, paths, {
      ...capacity,
      errorCode: 'ATTACHMENT_LIMIT_EXCEEDED',
    })
    const resources = this.accept({
      draftId,
      resources: attachments.map(attachment => ({
        mimeType: attachment.mimeType,
        name: attachment.name,
        resourceId: randomUUID(),
        sizeBytes: attachment.sizeBytes,
      })),
    })
    return Promise.all(resources.map(async (resource, index) => {
      try {
        await this.#bindExisting(resource, attachments[index]!)
        return toPublicResource(this.#requireOwned(resource))
      }
      catch {
        return this.fail(resource)
      }
    }))
  }

  recoverInterruptedImports(unavailableAttachmentIds: readonly string[] = []): void {
    this.#repository.interruptImports(new Date().toISOString())
    this.#repository.failUnavailableAttachments(unavailableAttachmentIds, new Date().toISOString())
  }

  async cleanupDrafts(now = Date.now()): Promise<string[]> {
    const cutoff = new Date(now - DRAFT_ATTACHMENT_RETENTION_MS).toISOString()
    const staleResources = this.#repository.listAll().filter(resource => resource.createdAt < cutoff)
    const retainedAttachmentIds = new Set<string>()
    const removableByDraft = new Map<string, string[]>()

    for (const resource of staleResources) {
      const draft = this.#drafts?.findById(resource.draftId)
      const referenced = draft
        ? getBuddyUserContentResourceIds(draft.content).includes(resource.resourceId)
        : false
      if (referenced) {
        if (resource.attachmentId)
          retainedAttachmentIds.add(resource.attachmentId)
        continue
      }
      const ids = removableByDraft.get(resource.draftId) ?? []
      ids.push(resource.resourceId)
      removableByDraft.set(resource.draftId, ids)
    }

    for (const [draftId, resourceIds] of removableByDraft)
      this.#repository.remove(draftId, resourceIds)
    return this.#attachments.cleanupDrafts(now, retainedAttachmentIds)
  }

  async #bindExisting(resource: BuddyComposerResource, attachment: AttachmentRecord): Promise<void> {
    const file = await open(attachment.storedPath, 'r')
    let bytes: Buffer
    try {
      bytes = Buffer.alloc(resource.sizeBytes + 1)
      let offset = 0
      while (offset < bytes.length) {
        const { bytesRead } = await file.read(bytes, offset, bytes.length - offset)
        if (!bytesRead)
          break
        offset += bytesRead
      }
      bytes = bytes.subarray(0, offset)
    }
    finally {
      await file.close()
    }
    validateResourceBytes(resource, bytes)
    this.#repository.finish({
      attachmentId: attachment.id,
      contentHash: createHash('sha256').update(bytes).digest('hex'),
      draftId: resource.draftId,
      now: new Date().toISOString(),
      resourceId: resource.resourceId,
    })
  }

  #requireOwned(input: BuddyComposerResourceTarget): ComposerResourceRecord {
    const resource = this.#repository.findById(input.resourceId)
    if (!resource || resource.draftId !== input.draftId)
      throw new AttachmentError('ATTACHMENT_NOT_FOUND')
    return resource
  }

  #assertCapacity(
    draftId: string,
    referencedResourceIds: readonly string[],
    incoming: readonly Pick<BuddyComposerResource, 'sizeBytes'>[],
  ): void {
    const capacity = this.#remainingCapacity(draftId, referencedResourceIds)
    const incomingBytes = incoming.reduce((total, resource) => total + resource.sizeBytes, 0)
    if (incoming.length > capacity.count || incomingBytes > capacity.totalBytes)
      throw new AttachmentError('ATTACHMENT_LIMIT_EXCEEDED')
  }

  #remainingCapacity(draftId: string, referencedResourceIds: readonly string[]) {
    if (
      referencedResourceIds.length > BUDDY_ATTACHMENT_COUNT_LIMIT
      || new Set(referencedResourceIds).size !== referencedResourceIds.length
    ) {
      throw new AttachmentError('VALIDATION_FAILED')
    }
    const usedBytes = referencedResourceIds.reduce(
      (total, resourceId) => total + this.#requireOwned({ draftId, resourceId }).sizeBytes,
      0,
    )
    if (usedBytes > BUDDY_ATTACHMENT_TOTAL_BYTES_LIMIT)
      throw new AttachmentError('VALIDATION_FAILED')
    return {
      count: BUDDY_ATTACHMENT_COUNT_LIMIT - referencedResourceIds.length,
      totalBytes: BUDDY_ATTACHMENT_TOTAL_BYTES_LIMIT - usedBytes,
    }
  }
}

function toPublicResource(resource: ComposerResourceRecord): BuddyComposerResource {
  const base = {
    draftId: resource.draftId,
    kind: resource.mimeType.startsWith('image/') ? 'image' as const : 'text' as const,
    mimeType: resource.mimeType,
    name: resource.name,
    resourceId: resource.resourceId,
    sizeBytes: resource.sizeBytes,
  }
  switch (resource.state) {
    case 'ready': return resource.source
      ? {
          ...base,
          previewUrl: null,
          source: resource.source,
          state: 'ready',
        }
      : {
          ...base,
          attachmentId: resource.attachmentId!,
          previewUrl: base.kind === 'image' ? `lexora-attachment://preview/${resource.attachmentId}` : null,
          state: 'ready',
        }
    case 'failed': return { ...base, errorCode: resource.errorCode!, state: 'failed' }
    case 'importing': return { ...base, state: 'importing' }
  }
}

function validateResourceBytes(resource: { mimeType: string, sizeBytes: number }, bytes: Uint8Array): void {
  if (bytes.byteLength !== resource.sizeBytes)
    throw new AttachmentError('VALIDATION_FAILED')
  if (!resource.mimeType.startsWith('image/')) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    }
    catch (error) {
      throw new AttachmentError('VALIDATION_FAILED', { cause: error })
    }
    return
  }
  const header = Buffer.from(bytes.subarray(0, 12))
  const mimeType = header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? 'image/png'
    : header[0] === 255 && header[1] === 216 && header[2] === 255
      ? 'image/jpeg'
      : /^GIF8[79]a/.test(header.toString('ascii'))
        ? 'image/gif'
        : header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP'
          ? 'image/webp'
          : null
  if (mimeType !== resource.mimeType)
    throw new AttachmentError('VALIDATION_FAILED')
  let image: PhotonImage
  try {
    image = PhotonImage.new_from_byteslice(bytes)
  }
  catch (error) {
    throw new AttachmentError('VALIDATION_FAILED', { cause: error })
  }
  try {
    if (!image.get_width() || !image.get_height())
      throw new AttachmentError('VALIDATION_FAILED')
  }
  finally {
    image.free()
  }
}
