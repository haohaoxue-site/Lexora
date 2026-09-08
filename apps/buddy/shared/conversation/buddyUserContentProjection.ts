import type { BuddyPromptDirective, BuddyUserContentV1 } from './buddyUserContent'
import { getBuddyUserContentResourceIds } from './buddyUserContent'

export type BuddyProjectionResource
  = | { kind: 'image', name: string }
    | { kind: 'text', name: string, text: string }

export interface BuddyProjectedResource {
  kind: BuddyProjectionResource['kind']
  marker: string
  resourceId: string
}

export interface BuddyUserContentProjection {
  imageResourceIds: string[]
  prompt: string
  resources: BuddyProjectedResource[]
}

export function projectBuddyUserContent(
  content: BuddyUserContentV1,
  resolveResource: (resourceId: string) => BuddyProjectionResource,
  resolveDirective: (directive: BuddyPromptDirective) => string,
): BuddyUserContentProjection {
  let imageOrdinal = 0
  let fileOrdinal = 0
  const appendices: string[] = []
  const resources = getBuddyUserContentResourceIds(content).map((resourceId) => {
    const resource = resolveResource(resourceId)
    const marker = resource.kind === 'image'
      ? `[IMAGE#${++imageOrdinal}]`
      : `[FILE#${++fileOrdinal}]`
    if (resource.kind === 'text')
      appendices.push(`${marker} ${escapeLiteralMarkers(resource.name)}\n${escapeLiteralMarkers(resource.text)}`)
    return { kind: resource.kind, marker, resourceId }
  })
  const markers = new Map(resources.map(resource => [resource.resourceId, resource.marker]))
  const inlineIds = new Set(content.body.flatMap(paragraph => paragraph.content.flatMap(
    node => node.type === 'resource_ref' ? [node.resourceId] : [],
  )))
  const prelude = content.panelResourceIds
    .filter(id => !inlineIds.has(id))
    .map(id => markers.get(id)!)
    .join('\n')
  const body = content.body.map((paragraph) => {
    let literal = ''
    let projected = ''
    for (const node of paragraph.content) {
      switch (node.type) {
        case 'text': {
          literal += node.text
          break
        }
        case 'hard_break': {
          literal += '\n'
          break
        }
        case 'prompt_directive': {
          if (node.directive === 'slash_command' && node.commandMode === 'action')
            throw new Error('Action commands cannot be sent as model input')
          literal += resolveDirective(node)
          break
        }
        case 'resource_ref': {
          projected += escapeLiteralMarkers(literal) + markers.get(node.resourceId)!
          literal = ''
          break
        }
      }
    }
    return projected + escapeLiteralMarkers(literal)
  }).join('\n')

  return {
    imageResourceIds: resources.filter(resource => resource.kind === 'image').map(resource => resource.resourceId),
    prompt: [prelude, body, ...appendices].filter(part => part.length > 0).join('\n\n'),
    resources,
  }
}

function escapeLiteralMarkers(text: string): string {
  return text.replace(/\[(IMAGE|FILE)#(\d+)\]/g, '［$1#$2］')
}
