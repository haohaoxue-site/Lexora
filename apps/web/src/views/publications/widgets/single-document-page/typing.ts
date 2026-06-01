import type {
  PublicationRenderedDocument,
  TiptapJsonContent,
} from '@haohaoxue/samepage-contracts'

export interface PublicationSingleDocumentPageProps {
  body: TiptapJsonContent
  document: PublicationRenderedDocument
}
