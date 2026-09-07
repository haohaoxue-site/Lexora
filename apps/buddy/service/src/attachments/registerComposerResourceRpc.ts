import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type { ComposerResourceService } from './ComposerResourceService'
import { z } from 'zod'
import { BUDDY_ATTACHMENT_COUNT_LIMIT } from '../../../shared/attachmentPolicy'
import { buddyResourceIdSchema } from '../../../shared/buddyUserContent'
import {
  buddyComposerResourceAcceptSchema,
  buddyComposerResourceCompleteSchema,
  buddyComposerResourceTargetSchema,
  buddyComposerSourceListSchema,
  buddyComposerSourceSelectSchema,
  buddyComposerSpaceFileSelectSchema,
} from '../../../shared/composerResource'
import { parse } from '../rpc/runtimeRequest'

const referencedResourceIdsSchema = z.array(buddyResourceIdSchema)
  .max(BUDDY_ATTACHMENT_COUNT_LIMIT)
  .refine(ids => new Set(ids).size === ids.length)

const sourceSelectSchema = buddyComposerSourceSelectSchema.extend({
  referencedResourceIds: referencedResourceIdsSchema.default([]),
}).strict()

const spaceFileSelectSchema = buddyComposerSpaceFileSelectSchema.extend({
  referencedResourceIds: referencedResourceIdsSchema.default([]),
}).strict()

const fileSelectSchema = z.object({
  draftId: buddyResourceIdSchema,
  paths: z.array(z.string().min(1)).max(BUDDY_ATTACHMENT_COUNT_LIMIT),
  referencedResourceIds: referencedResourceIdsSchema.default([]),
}).strict()

export function registerComposerResourceRpc(options: {
  rpc: RuntimeRequestRegistrar
  service: ComposerResourceService
}): () => void {
  const disposers = [
    options.rpc.onRequest('composerResources.listSources', params => options.service.listSources(
      parse(buddyComposerSourceListSchema, params),
    )),
    options.rpc.onRequest('composerResources.selectSource', (params) => {
      const { referencedResourceIds, ...input } = parse(sourceSelectSchema, params)
      return options.service.selectSource(input, referencedResourceIds)
    }),
    options.rpc.onRequest('composerResources.selectSpaceFile', (params) => {
      const { referencedResourceIds, ...input } = parse(spaceFileSelectSchema, params)
      return options.service.selectSpaceFile(input, referencedResourceIds)
    }),
    options.rpc.onRequest('composerResources.accept', params => options.service.accept(
      parse(buddyComposerResourceAcceptSchema, params),
    )),
    options.rpc.onRequest('composerResources.complete', params => options.service.complete(
      parse(buddyComposerResourceCompleteSchema, params),
    )),
    options.rpc.onRequest('composerResources.fail', params => options.service.fail(
      parse(buddyComposerResourceTargetSchema, params),
    )),
    options.rpc.onRequest('composerResources.retry', params => options.service.retry(
      parse(buddyComposerResourceTargetSchema, params),
    )),
    options.rpc.onRequest('composerResources.list', (params) => {
      const { draftId } = parse(z.object({ draftId: buddyResourceIdSchema }).strict(), params)
      return options.service.list(draftId)
    }),
    options.rpc.onRequest('composerResources.registerFiles', (params) => {
      const { draftId, paths, referencedResourceIds } = parse(fileSelectSchema, params)
      return options.service.registerFiles({ draftId, paths, referencedResourceIds })
    }),
  ]
  return () => disposers.splice(0).forEach(dispose => dispose())
}
