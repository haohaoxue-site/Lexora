import type {
  TiptapDocumentCollaborationContentProjection,
  TiptapJsonContent,
  TiptapJsonNode,
} from '@haohaoxue/samepage-contracts'
import { TIPTAP_DOCUMENT_COLLABORATION_FIELD } from '@haohaoxue/samepage-contracts'
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
