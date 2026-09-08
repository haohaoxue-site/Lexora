import type {
  BuddyComposerDraft,
  BuddyComposerDraftOpen,
  BuddyComposerDraftSave,
} from '../../../shared/conversation/composerDraft'
import type { ComposerDraftRepository } from '../storage/composerDraftRepository'
import { BuddyServiceError } from '../rpc/runtimeRequest'

export class ComposerDraftService {
  readonly #repository: ComposerDraftRepository

  constructor(repository: ComposerDraftRepository) {
    this.#repository = repository
  }

  get(draftId: string): BuddyComposerDraft {
    const draft = this.#repository.findById(draftId)
    if (!draft)
      throw new BuddyServiceError('VALIDATION_FAILED')
    return draft
  }

  open(input: BuddyComposerDraftOpen): BuddyComposerDraft {
    return this.#repository.open({ ...input, now: new Date().toISOString() })
  }

  save(input: BuddyComposerDraftSave): BuddyComposerDraft {
    return this.#repository.save({ ...input, now: new Date().toISOString() })
  }
}
