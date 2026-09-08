import type { AutomationDefinitionDraft } from '@buddy-shared/automation'
import type { LocalAutomation } from '@buddy-shared/automation/automationApi'
import type { AutomationActionResult, AutomationCapability } from '../../state/typing'
import { describe, expect, it } from 'vitest'
import { effectScope, shallowRef } from 'vue'
import { deferred } from '../../../../../__tests__/deferred'
import { useAutomationEditorRoute } from '../useAutomationEditorRoute'

const draft: AutomationDefinitionDraft = {
  executionProfile: 'workspace_write',
  model: { mode: 'default' },
  name: 'Example',
  prompt: 'Prepare a summary',
  spaceId: null,
  timing: {
    activeFrom: null,
    activeUntil: null,
    schedule: { cadence: 'daily', kind: 'calendar', localTime: '09:00' },
    timezone: 'Asia/Shanghai',
  },
}

function definition(id: string): LocalAutomation {
  return {
    ...draft,
    blockedReason: null,
    createdAt: '2026-09-08T00:00:00.000Z',
    id,
    lastRunAt: null,
    nextRunAt: '2026-09-09T01:00:00.000Z',
    revision: 1,
    status: 'active',
    updatedAt: '2026-09-08T00:00:00.000Z',
  }
}

function actions(): Pick<AutomationCapability, 'get' | 'create' | 'update'> {
  return {
    create: async () => ({ status: 'succeeded', value: definition('new') }),
    get: async id => definition(id),
    update: async automation => ({ status: 'succeeded', value: automation }),
  }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++)
    await Promise.resolve()
}

describe('automation editor route', () => {
  it('keeps a later editor independent from an earlier load failure', async () => {
    const scope = effectScope()
    const id = shallowRef<string | null>('first')
    const first = deferred<LocalAutomation>()
    const api = actions()
    api.get = async id => id === 'first' ? first.promise : definition(id)
    const editor = scope.run(() => useAutomationEditorRoute({
      automationId: id,
      automations: api,
      language: 'zh-CN',
      onSaved: () => {},
      ready: Promise.resolve(),
    }))!
    try {
      await settle()
      id.value = 'second'
      await settle()
      first.reject(new Error('First automation is unavailable'))
      await settle()
      expect(editor.automation.value).toEqual(definition('second'))
      expect(editor.error.value).toBeNull()
      expect(editor.isLoading.value).toBe(false)
    }
    finally {
      scope.stop()
    }
  })

  it('does not put a failed initialization error onto a new create route', async () => {
    const scope = effectScope()
    const id = shallowRef<string | null>('first')
    const ready = deferred<void>()
    const editor = scope.run(() => useAutomationEditorRoute({
      automationId: id,
      automations: actions(),
      language: 'zh-CN',
      onSaved: () => {},
      ready: ready.promise,
    }))!
    try {
      id.value = null
      ready.reject(new Error('Initial read failed'))
      await settle()
      expect(editor.mode.value).toBe('create')
      expect(editor.error.value).toBeNull()
      expect(editor.automation.value).toBeNull()
      expect(editor.isLoading.value).toBe(false)
    }
    finally {
      scope.stop()
    }
  })

  it('does not navigate a different editor when an earlier save succeeds', async () => {
    const scope = effectScope()
    const id = shallowRef<string | null>('first')
    const pending = deferred<AutomationActionResult<LocalAutomation>>()
    const navigations: string[] = []
    const api = actions()
    api.update = () => pending.promise
    const editor = scope.run(() => useAutomationEditorRoute({
      automationId: id,
      automations: api,
      language: 'zh-CN',
      onSaved: () => { navigations.push('plans') },
      ready: Promise.resolve(),
    }))!
    try {
      await settle()
      const save = editor.save(draft)
      id.value = 'second'
      await settle()
      pending.resolve({ status: 'succeeded', value: definition('first') })
      await save
      expect(editor.automation.value).toEqual(definition('second'))
      expect(editor.error.value).toBeNull()
      expect(editor.isSaving.value).toBe(false)
      expect(navigations).toEqual([])
    }
    finally {
      scope.stop()
    }
  })
})
