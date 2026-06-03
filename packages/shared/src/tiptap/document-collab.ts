import type {
  TiptapDocumentCollaborationContentProjection,
  TiptapJsonContent,
  TiptapJsonNode,
} from '@haohaoxue/samepage-contracts'
import { TIPTAP_DOCUMENT_COLLABORATION_FIELD } from '@haohaoxue/samepage-contracts/tiptap/constants'
import { getSchema } from '@tiptap/core'
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap'
import * as Y from 'yjs'
import {
  unwrapTiptapContent,
  wrapTiptapContent,
} from './content'
import {
  createTiptapDocumentBodySchemaExtensions,
  createTiptapDocumentTitleSchemaExtensions,
} from './document-schema'
import {
  fromTiptapDocumentTitleEditorContent,
  toTiptapDocumentTitleEditorContent,
} from './document-title-content'

const titleSchema = getSchema(createTiptapDocumentTitleSchemaExtensions())
const bodySchema = getSchema(createTiptapDocumentBodySchemaExtensions())

export function createTiptapDocumentCollaborationYdoc(
  content: TiptapDocumentCollaborationContentProjection,
): Y.Doc {
  const document = new Y.Doc()

  hydrateTiptapDocumentCollaborationYdoc(document, content)

  return document
}

export function createTiptapDocumentCollaborationCheckpointState(
  content: TiptapDocumentCollaborationContentProjection,
): Uint8Array {
  return new Uint8Array(Y.encodeStateAsUpdate(createTiptapDocumentCollaborationYdoc(content)))
}

export function hydrateTiptapDocumentCollaborationYdoc(
  document: Y.Doc,
  content: TiptapDocumentCollaborationContentProjection,
): void {
  document.transact(() => {
    writeFragmentContent({
      document,
      field: TIPTAP_DOCUMENT_COLLABORATION_FIELD.TITLE,
      content: wrapTiptapContent(toTiptapDocumentTitleEditorContent(content.title)),
      schema: titleSchema,
    })
    writeFragmentContent({
      document,
      field: TIPTAP_DOCUMENT_COLLABORATION_FIELD.BODY,
      content: wrapTiptapContent(content.body),
      schema: bodySchema,
    })
  }, 'samepage-tiptap-document-collaboration-bootstrap')
}

export function replaceTiptapDocumentCollaborationYdocTitle(
  document: Y.Doc,
  title: TiptapJsonContent,
): void {
  document.transact(() => {
    writeFragmentContent({
      document,
      field: TIPTAP_DOCUMENT_COLLABORATION_FIELD.TITLE,
      content: wrapTiptapContent(toTiptapDocumentTitleEditorContent(title)),
      schema: titleSchema,
    })
  }, 'samepage-tiptap-document-title-rename')
}

export function createTiptapDocumentCollaborationTitlePatchCheckpoint(input: {
  checkpointState: Uint8Array | null
  updates: Uint8Array[]
  title: TiptapJsonContent
  bodyWhenYdocMissing: TiptapJsonContent
}): {
  checkpointState: Uint8Array
  projection: TiptapDocumentCollaborationContentProjection
} {
  const document = new Y.Doc()

  if (input.checkpointState) {
    Y.applyUpdate(document, input.checkpointState)
  }
  else {
    hydrateTiptapDocumentCollaborationYdoc(document, {
      title: input.title,
      body: input.bodyWhenYdocMissing,
    })
  }

  for (const update of input.updates) {
    Y.applyUpdate(document, update)
  }

  replaceTiptapDocumentCollaborationYdocTitle(document, input.title)

  const projection = projectTiptapDocumentCollaborationYdoc(document)
  const checkpointState = new Uint8Array(Y.encodeStateAsUpdate(document))
  document.destroy()

  return {
    checkpointState,
    projection,
  }
}

export function projectTiptapDocumentCollaborationYdoc(
  document: Y.Doc,
): TiptapDocumentCollaborationContentProjection {
  return {
    title: fromTiptapDocumentTitleEditorContent(readFragmentContent(document, TIPTAP_DOCUMENT_COLLABORATION_FIELD.TITLE)),
    body: readFragmentContent(document, TIPTAP_DOCUMENT_COLLABORATION_FIELD.BODY),
  }
}

function writeFragmentContent(options: {
  document: Y.Doc
  field: string
  content: TiptapJsonNode
  schema: typeof titleSchema
}) {
  const fragment = options.document.getXmlFragment(options.field)

  if (fragment.length > 0) {
    fragment.delete(0, fragment.length)
  }

  prosemirrorJSONToYXmlFragment(options.schema, options.content, fragment)
}

function readFragmentContent(
  document: Y.Doc,
  field: string,
): TiptapJsonContent {
  return unwrapTiptapContent(
    yXmlFragmentToProsemirrorJSON(document.getXmlFragment(field)),
  )
}
