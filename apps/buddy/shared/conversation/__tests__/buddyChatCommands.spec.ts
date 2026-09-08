import { describe, expect, it } from 'vitest'

import {
  parseBuddyChatCommand,
} from '../buddyChatCommands'

describe('buddyChatCommands', () => {
  it('parses only registered commands at the start of the message', () => {
    expect(parseBuddyChatCommand('/compact focus on unresolved decisions')).toEqual({
      arguments: 'focus on unresolved decisions',
      kind: 'action',
      name: 'compact',
    })
    expect(parseBuddyChatCommand('  /plan\nthen continue')).toEqual({
      arguments: 'then continue',
      kind: 'prompt',
      name: 'plan',
    })
    expect(parseBuddyChatCommand('please /compact')).toBeNull()
    expect(parseBuddyChatCommand('/unknown')).toBeNull()
  })
})
