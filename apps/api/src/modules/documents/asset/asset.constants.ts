import { DOCUMENT_IMAGE_MAX_BYTES } from '@haohaoxue/lexora-contracts'
import { prettyBytes } from '@haohaoxue/lexora-shared'

export const DOCUMENT_IMAGE_SIZE_LIMIT_LABEL = prettyBytes(DOCUMENT_IMAGE_MAX_BYTES)
export const DOCUMENT_IMAGE_TOO_LARGE_MESSAGE = `图片大小不能超过 ${DOCUMENT_IMAGE_SIZE_LIMIT_LABEL}`
