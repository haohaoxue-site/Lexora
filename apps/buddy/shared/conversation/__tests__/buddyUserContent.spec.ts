import { describe, expect, it } from 'vitest'
import {
  buddyUserContentV1Schema,
  createBuddyUserContent,
} from '../buddyUserContent'
import { projectBuddyUserContent } from '../buddyUserContentProjection'

const content = buddyUserContentV1Schema.parse({
  body: [{
    content: [
      { text: '比较 ', type: 'text' },
      { resourceId: 'image-a', type: 'resource_ref' },
      { text: ' 和 ', type: 'text' },
      { resourceId: 'image-b', type: 'resource_ref' },
      { text: '，再看 ', type: 'text' },
      { resourceId: 'image-a', type: 'resource_ref' },
    ],
    type: 'paragraph',
  }],
  panelResourceIds: ['notes', 'image-a'],
  version: 1,
})

describe('buddy user content', () => {
  it.each([
    { ...content, version: 2 },
    { ...content, extra: true },
    { ...content, panelResourceIds: ['image-a', 'image-a'] },
    { ...content, panelResourceIds: ['../../private'] },
    { ...content, body: [] },
    { ...content, body: [{ content: [], type: 'heading' }] },
    { ...content, body: [{ content: [{ type: 'image', url: '/private' }], type: 'paragraph' }] },
    { ...content, body: [{ content: [{ placementId: 'extra', resourceId: 'image-a', type: 'resource_ref' }], type: 'paragraph' }] },
    { ...content, body: [{ content: [{ directive: 'skill', commandMode: 'prompt', type: 'prompt_directive', value: 'review' }], type: 'paragraph' }] },
    { ...content, body: [{ content: [{ directive: 'slash_command', type: 'prompt_directive', value: '/review' }], type: 'paragraph' }] },
  ])('rejects unknown or ambiguous persisted structures: %j', (value) => {
    expect(buddyUserContentV1Schema.safeParse(value).success).toBe(false)
  })

  it('projects one stable image order, repeated markers, and the complete text appendix', () => {
    const projection = projectBuddyUserContent(content, resourceId => resourceId === 'notes'
      ? { kind: 'text', name: 'notes.md', text: '完整内容\n最后一行\n' }
      : { kind: 'image', name: `${resourceId}.png` }, () => '')

    expect(projection).toEqual({
      imageResourceIds: ['image-a', 'image-b'],
      prompt: '[FILE#1]\n\n比较 [IMAGE#1] 和 [IMAGE#2]，再看 [IMAGE#1]\n\n[FILE#1] notes.md\n完整内容\n最后一行\n',
      resources: [
        { kind: 'text', marker: '[FILE#1]', resourceId: 'notes' },
        { kind: 'image', marker: '[IMAGE#1]', resourceId: 'image-a' },
        { kind: 'image', marker: '[IMAGE#2]', resourceId: 'image-b' },
      ],
    })
  })

  it('keeps handwritten markers literal, including split text nodes and appendix content', () => {
    const projection = projectBuddyUserContent({
      ...content,
      body: [{
        content: [
          { text: '[IMA', type: 'text' },
          { text: 'GE#1] ', type: 'text' },
          { directive: 'skill', type: 'prompt_directive', value: 'review' },
          { resourceId: 'image-a', type: 'resource_ref' },
        ],
        type: 'paragraph',
      }],
    }, id => id === 'notes'
      ? { kind: 'text', name: '[FILE#7].txt', text: '[IMAGE#2]' }
      : { kind: 'image', name: 'a.png' }, () => '[FILE#4]')

    expect(projection.prompt).toBe('[FILE#1]\n\n［IMAGE#1］ ［FILE#4］[IMAGE#1]\n\n[FILE#1] ［FILE#7］.txt\n［IMAGE#2］')
  })

  it('does not discard unresolved resources or send action commands as model input', () => {
    expect(() => projectBuddyUserContent(content, () => {
      throw new Error('Resource unavailable')
    }, () => '')).toThrow('Resource unavailable')
    expect(() => projectBuddyUserContent({
      ...createBuddyUserContent(),
      body: [{
        content: [{ commandMode: 'action', directive: 'slash_command', type: 'prompt_directive', value: '/compact' }],
        type: 'paragraph',
      }],
    }, () => ({ kind: 'image', name: 'unused.png' }), () => '')).toThrow('Action commands')
  })
})
