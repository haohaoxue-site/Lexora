import type {
  PublicationInternalLinkResolution,
  PublicationNavItem,
  PublicationSidebarGroup,
  PublicationSidebarPage,
} from '@haohaoxue/samepage-contracts/document/publication'
import type {
  TiptapJsonContent,
  TiptapJsonNode,
} from '@haohaoxue/samepage-contracts/tiptap'
import {
  DOCUMENT_PUBLICATION_NAV_ITEM_EXTERNAL_TARGET,
  DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET,
  DOCUMENT_PUBLICATION_NAV_ITEM_TYPE,
} from '@haohaoxue/samepage-contracts/document/publication/constants'
import { isExternalPublicationHref, normalizePublicationHref } from '@haohaoxue/samepage-shared/document'

export const PUBLICATION_UNPUBLISHED_MESSAGE = '此页面未发布'
export const PUBLICATION_DISABLED_LINK_CLASS = 'publication-link-disabled'

export interface ResolvedPublicationNavItem {
  disabled: boolean
  external: boolean
  href: string
  label: string
  openInNewTab: boolean
}

export function rewritePublicationInternalLinks(
  content: TiptapJsonContent,
  internalLinks: PublicationInternalLinkResolution[],
): TiptapJsonContent {
  const internalLinkByDocumentId = new Map(internalLinks.map(link => [link.targetDocumentId, link]))

  return content.map(node => rewritePublicationInternalLinkNode(node, internalLinkByDocumentId))
}

export function resolvePublicationNavItems(input: {
  groups: PublicationSidebarGroup[]
  items: PublicationNavItem[]
  siteId: string
}): ResolvedPublicationNavItem[] {
  const pageById = new Map(collectPublicationSidebarPages(input.groups).map(page => [page.id, page]))
  const firstPageByGroupId = new Map(
    input.groups.flatMap(group => group.pages[0] ? [[group.id, group.pages[0]] as const] : []),
  )

  return input.items.map((item) => {
    if (item.type === DOCUMENT_PUBLICATION_NAV_ITEM_TYPE.EXTERNAL) {
      const href = normalizePublicationHref(item.url)

      if (!href) {
        return {
          disabled: true,
          external: false,
          href: '#',
          label: item.label,
          openInNewTab: false,
        }
      }

      return {
        disabled: false,
        external: isExternalPublicationHref(href),
        href,
        label: item.label,
        openInNewTab: isExternalPublicationHref(href) && item.openTarget === DOCUMENT_PUBLICATION_NAV_ITEM_EXTERNAL_TARGET.BLANK,
      }
    }

    if (item.target === DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET.HOME) {
      return {
        disabled: false,
        external: false,
        href: `/s/${input.siteId}`,
        label: item.label,
        openInNewTab: false,
      }
    }

    if (item.target === DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET.SECTION && item.targetId) {
      const page = firstPageByGroupId.get(item.targetId)

      if (page) {
        return {
          disabled: false,
          external: false,
          href: `/s/${input.siteId}/${page.documentId}`,
          label: item.label,
          openInNewTab: false,
        }
      }
    }

    if (item.target === DOCUMENT_PUBLICATION_NAV_ITEM_INTERNAL_TARGET.PAGE && item.targetId) {
      const page = pageById.get(item.targetId)

      if (page) {
        return {
          disabled: false,
          external: false,
          href: `/s/${input.siteId}/${page.documentId}`,
          label: item.label,
          openInNewTab: false,
        }
      }
    }

    return {
      disabled: true,
      external: false,
      href: '#',
      label: item.label,
      openInNewTab: false,
    }
  })
}

export function collectPublicationSidebarPages(groups: PublicationSidebarGroup[]): PublicationSidebarPage[] {
  return groups.flatMap(group => group.pages.flatMap(page => collectPublicationSidebarPage(page)))
}

function collectPublicationSidebarPage(page: PublicationSidebarPage): PublicationSidebarPage[] {
  return [page, ...page.children.flatMap(child => collectPublicationSidebarPage(child))]
}

function rewritePublicationInternalLinkNode(
  node: TiptapJsonNode,
  internalLinkByDocumentId: ReadonlyMap<string, PublicationInternalLinkResolution>,
): TiptapJsonNode {
  return {
    ...node,
    marks: node.marks?.map((mark) => {
      if (mark.type !== 'link') {
        return mark
      }

      const attrs = mark.attrs ?? {}
      const href = typeof attrs.href === 'string' ? attrs.href : ''
      const targetDocumentId = parseInternalDocumentHref(href)

      if (!targetDocumentId) {
        return mark
      }

      const resolution = internalLinkByDocumentId.get(targetDocumentId)

      if (resolution?.published && resolution.href) {
        return {
          ...mark,
          attrs: {
            ...attrs,
            href: resolution.href,
            class: removeClassName(attrs.class, PUBLICATION_DISABLED_LINK_CLASS),
          },
        }
      }

      return {
        ...mark,
        attrs: {
          ...attrs,
          href: '#',
          class: addClassName(attrs.class, PUBLICATION_DISABLED_LINK_CLASS),
        },
      }
    }),
    content: node.content?.map(child => rewritePublicationInternalLinkNode(child, internalLinkByDocumentId)),
  }
}

function parseInternalDocumentHref(href: string): string | null {
  if (!href.trim()) {
    return null
  }

  try {
    const url = new URL(href, window.location.origin)
    const [prefix, documentId] = url.pathname.split('/').filter(Boolean)

    if ((prefix === 'docs' || prefix === 'p') && documentId) {
      return documentId
    }

    return null
  }
  catch {
    return null
  }
}

function addClassName(value: unknown, className: string): string {
  const classNames = typeof value === 'string'
    ? value.split(/\s+/).filter(Boolean)
    : []

  if (!classNames.includes(className)) {
    classNames.push(className)
  }

  return classNames.join(' ')
}

function removeClassName(value: unknown, className: string): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const classNames = value.split(/\s+/).filter(item => item && item !== className)
  return classNames.length ? classNames.join(' ') : undefined
}
