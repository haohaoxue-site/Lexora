import { describe, expect, it } from 'vitest'

import {
  BUDDY_PERMISSION_MODES,
  resolveBuddyPermissionMode,
  resolveBuddyPermissionSettings,
} from '../permissionMode'

describe('buddy permission modes', () => {
  it('maps the four product modes to two independent permission axes', () => {
    expect(BUDDY_PERMISSION_MODES.map((mode) => {
      const settings = resolveBuddyPermissionSettings(mode)
      return [mode, settings, resolveBuddyPermissionMode(settings)]
    })).toEqual([
      ['read_only', { approvalPolicy: 'policy', executionProfile: 'read_only' }, 'read_only'],
      ['manual_approval', { approvalPolicy: 'manual', executionProfile: 'workspace_write' }, 'manual_approval'],
      ['policy_approval', { approvalPolicy: 'policy', executionProfile: 'workspace_write' }, 'policy_approval'],
      ['full_access', { approvalPolicy: 'policy', executionProfile: 'full_access' }, 'full_access'],
    ])
  })
})
