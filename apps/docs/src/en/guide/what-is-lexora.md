# What is Lexora

Lexora is a collaborative document platform. It brings AI chat and document editing into one workspace. Documents can be published as public read-only pages or sites.

## Current Capabilities

- AI chat: create sessions, select models, stream replies, switch message branches, and retry answers.
- Document pages: create a page tree and edit rich text content with tables, code blocks, and math.
- Document collaboration: invite users or create collaboration links with read and edit permissions.
- Public publishing: publish a document as a `/p/*` page or organize documents into a `/s/*` site.
- Personal settings: manage account details, preferences, model providers, and default models.
- Self-hosting and admin: run the full service and manage users, email, login policy, model providers, and audit records.

## Product Boundaries

Lexora separates three access modes:

- Private documents: visible only to the document owner.
- In-product collaboration: signed-in users enter `/docs` with explicit read or edit access.
- Public publishing: anonymous visitors read published pages without joining collaboration.

Collaboration links do not become public publishing links. Public publishing never creates collaboration grants for visitors.

## Who It Is For

Lexora is for individuals, small teams, and communities that want control over their documents, model providers, and deployment.
