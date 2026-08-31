# Document Pages

Document pages are the core knowledge object in Lexora. Pages are organized as a tree and edited with a rich text editor.

## Page Tree

Documents are stored in the current personal workspace by default. A page can have child pages; top-level pages have no parent. Existing team workspaces can remain as separate document containers.

## Rich Text Editing

The editor supports common block content, including paragraphs, headings, lists, tasks, tables, code blocks, images, and math. Markdown snippets can be pasted and converted into rich text where possible.

## History and Restore

The editor autosaves title and body as one consistent current projection. Saves use a revision to prevent stale pages from silently overwriting newer content and an idempotency key to make retries safe.

Historical versions support reading, auditing, and restore. Restoring creates a new current projection and a restore audit snapshot.

## Trash

Deleted documents move into trash. When a document is trashed, publication access is withdrawn so external entries cannot keep reading deleted content.

## Document AI

The editor includes AI generate and rewrite actions. Generate is for writing new content from an empty block; rewrite is for selected text. AI output remains a local suggestion until accepted into the document.
