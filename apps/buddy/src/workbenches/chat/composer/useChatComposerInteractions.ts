import type { LocalRun } from '@buddy-electron/shared/localChatApi'
import type { Ref } from 'vue'
import type { ChatComposerInteraction } from './chatComposerInteraction'
import { readonly, shallowRef, watch } from 'vue'

interface UseChatComposerInteractionsOptions {
  runs: Readonly<Ref<ReadonlyArray<LocalRun>>>
}

export function useChatComposerInteractions(options: UseChatComposerInteractionsOptions) {
  const interaction = shallowRef<ChatComposerInteraction | null>(null)
  const trackedActionCommandRunIds = new Set<string>()

  watch(options.runs, projectTrackedRuns)

  function trackActionCommand(runId: string) {
    trackedActionCommandRunIds.add(runId)
    projectTrackedRuns(options.runs.value)
  }

  function dismissInteraction(id: string) {
    if (interaction.value?.id === id)
      interaction.value = null
  }

  function projectTrackedRuns(runs: ReadonlyArray<LocalRun>) {
    for (const run of runs) {
      if (
        !trackedActionCommandRunIds.has(run.id)
        || run.status === 'queued'
        || run.status === 'running'
      ) {
        continue
      }
      trackedActionCommandRunIds.delete(run.id)
      if (run.errorCode === 'CONTEXT_COMPACTION_NOT_NEEDED') {
        interaction.value = {
          autoDismissMs: 5_000,
          dismissible: true,
          id: `command-feedback:${run.id}`,
          kind: 'notice',
          messageKey: 'desktop.chat.compactionNotNeeded',
          tone: 'info',
        }
      }
    }
  }

  return {
    dismissInteraction,
    interaction: readonly(interaction),
    trackActionCommand,
  }
}
