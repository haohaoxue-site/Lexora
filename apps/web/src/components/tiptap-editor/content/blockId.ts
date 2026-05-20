import {
  TIPTAP_BODY_BLOCK_ID_ATTRIBUTE,
  TIPTAP_BODY_BLOCK_ID_NODE_TYPES,
  TIPTAP_BODY_BLOCK_ID_PREFIX,
} from '@haohaoxue/samepage-contracts'
import { customAlphabet } from 'nanoid'
import { TIPTAP_NESTED_PARAGRAPH_PARENT_NODE_NAMES } from './blockTaxonomy'

const BLOCK_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'
const BLOCK_ID_SIZE = 12
const BLOCK_ID_PATTERN = new RegExp(`^${TIPTAP_BODY_BLOCK_ID_PREFIX}[0-9a-z]{${BLOCK_ID_SIZE}}$`)

export const BODY_BLOCK_ID_ATTRIBUTE = TIPTAP_BODY_BLOCK_ID_ATTRIBUTE
export const BODY_BLOCK_ID_NODE_TYPES = TIPTAP_BODY_BLOCK_ID_NODE_TYPES

export type BodyBlockIdNodeType = (typeof TIPTAP_BODY_BLOCK_ID_NODE_TYPES)[number]

interface BodyBlockIdNodeLike {
  isBlock: boolean
  type: {
    name: string
  }
}

interface BodyBlockIdParentLike {
  type?: {
    name?: string
  }
}

const BODY_BLOCK_ID_NODE_TYPE_SET = new Set<string>(BODY_BLOCK_ID_NODE_TYPES)
const NESTED_PARAGRAPH_PARENT_NODE_TYPE_SET = new Set<string>(TIPTAP_NESTED_PARAGRAPH_PARENT_NODE_NAMES)

const createBlockIdSuffix = customAlphabet(BLOCK_ID_ALPHABET, BLOCK_ID_SIZE)

export function createBlockId(_nodeType: BodyBlockIdNodeType) {
  return `${TIPTAP_BODY_BLOCK_ID_PREFIX}${createBlockIdSuffix()}`
}

export function isBlockId(value: unknown): value is string {
  return typeof value === 'string' && BLOCK_ID_PATTERN.test(value)
}

export function isBodyBlockIdNodeTypeName(value: string): value is BodyBlockIdNodeType {
  return BODY_BLOCK_ID_NODE_TYPE_SET.has(value)
}

export function isAddressableBodyBlock(
  node: BodyBlockIdNodeLike,
  parent: BodyBlockIdParentLike | null | undefined,
): boolean {
  if (!node.isBlock || !isBodyBlockIdNodeTypeName(node.type.name)) {
    return false
  }

  if (node.type.name !== 'paragraph') {
    return true
  }

  const parentTypeName = parent?.type?.name

  return !parentTypeName || !NESTED_PARAGRAPH_PARENT_NODE_TYPE_SET.has(parentTypeName)
}
