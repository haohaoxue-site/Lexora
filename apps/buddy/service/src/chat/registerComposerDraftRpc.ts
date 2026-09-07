import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type { ComposerDraftService } from './ComposerDraftService'
import {
  buddyComposerDraftOpenSchema,
  buddyComposerDraftSaveSchema,
  buddyComposerDraftTargetSchema,
} from '../../../shared/composerDraft'
import { parse } from '../rpc/runtimeRequest'

export function registerComposerDraftRpc(options: {
  rpc: RuntimeRequestRegistrar
  service: ComposerDraftService
}): () => void {
  const disposers = [
    options.rpc.onRequest('composerDrafts.open', params => options.service.open(
      parse(buddyComposerDraftOpenSchema, params),
    )),
    options.rpc.onRequest('composerDrafts.get', (params) => {
      const { draftId } = parse(buddyComposerDraftTargetSchema, params)
      return options.service.get(draftId)
    }),
    options.rpc.onRequest('composerDrafts.save', params => options.service.save(
      parse(buddyComposerDraftSaveSchema, params),
    )),
  ]
  return () => disposers.splice(0).forEach(dispose => dispose())
}
