# Document Pages

Document pages are the core collaboration object in SamePage AI. Pages are organized as a tree and edited with a rich text editor.

## Page Tree

Documents are stored in the current personal workspace. A page can have child pages; top-level pages have no parent. The document tree is grouped by private and collaborative entries, so collaborators do not see unauthorized ancestors or sibling branches.

## Rich Text Editing

The editor supports common block content, including paragraphs, headings, lists, tasks, tables, code blocks, images, and math. Markdown snippets can be pasted and converted into rich text where possible.

## History and Restore

Documents maintain a current read projection and historical versions. Historical versions are used for reading, auditing, and restore. Real-time collaboration state remains owned by the editing runtime.

Restoring a historical version creates a new editing runtime baseline instead of overwriting an active collaborative document in place.

## Trash

Deleted documents move into trash. When a document is trashed, related collaboration and publication access is withdrawn so external entries cannot keep reading deleted content.

## Document AI

The editor includes AI generate and rewrite actions. Generate is for writing new content from an empty block; rewrite is for selected text. AI output remains a local suggestion until accepted into the document.
