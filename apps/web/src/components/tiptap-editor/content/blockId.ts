import {
  TIPTAP_BODY_BLOCK_ID_ATTRIBUTE,
  TIPTAP_BODY_BLOCK_ID_NODE_TYPES,
  TIPTAP_BODY_BLOCK_ID_PREFIX,
} from '@haohaoxue/samepage-contracts'
import { customAlphabet } from 'nanoid'

const BLOCK_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'
const BLOCK_ID_SIZE = 12
const BLOCK_ID_PATTERN = new RegExp(`^${TIPTAP_BODY_BLOCK_ID_PREFIX}[0-9a-z]{${BLOCK_ID_SIZE}}$`)

export const BODY_BLOCK_ID_ATTRIBUTE = TIPTAP_BODY_BLOCK_ID_ATTRIBUTE
export const BODY_BLOCK_ID_NODE_TYPES = TIPTAP_BODY_BLOCK_ID_NODE_TYPES

export type BodyBlockIdNodeType = (typeof TIPTAP_BODY_BLOCK_ID_NODE_TYPES)[number]

const createBlockIdSuffix = customAlphabet(BLOCK_ID_ALPHABET, BLOCK_ID_SIZE)

export function createBlockId(_nodeType: BodyBlockIdNodeType) {
  return `${TIPTAP_BODY_BLOCK_ID_PREFIX}${createBlockIdSuffix()}`
}

export function isBlockId(value: unknown): value is string {
  return typeof value === 'string' && BLOCK_ID_PATTERN.test(value)
}
