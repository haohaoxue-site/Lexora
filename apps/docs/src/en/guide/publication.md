# Public Publishing

Public publishing exposes documents to outside visitors. Published content is read-only and does not enter the document collaboration runtime.

## Single Page Publishing

Single page publishing uses `/p/:documentId`. A document can explicitly enable or disable public access, or inherit public state from its parent page.

This is useful for a single guide, announcement, tutorial, or temporary reference page.

## Site Publishing

Site publishing uses `/s/:siteId` and `/s/:siteId/:documentId`. A site can configure title, icon, home page, sidebar pages, sections, and top navigation.

This is useful when a set of documents should become a VitePress-like public site.

## Asset Access

Public publishing uses a dedicated public asset scope. Published pages do not reuse the signed-in `/docs` asset permissions.

## Internal Links

Internal links inside published content only navigate to targets that are also published. Unpublished targets keep their link appearance but do not expose the private page.
