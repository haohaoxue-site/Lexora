import Image from '@tiptap/extension-image'

export const DocumentImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      assetId: {
        default: null,
        parseHTML: element => element.getAttribute('data-asset-id'),
        renderHTML: (attributes) => {
          if (typeof attributes.assetId !== 'string' || !attributes.assetId.length) {
            return {}
          }

          return {
            'data-asset-id': attributes.assetId,
          }
        },
      },
      alt: {
        default: null,
      },
      width: {
        default: null,
      },
      height: {
        default: null,
      },
      textAlign: {
        default: null,
        parseHTML: element => resolveImageTextAlign(element),
        renderHTML: (attributes) => {
          if (!isImageTextAlign(attributes.textAlign)) {
            return {}
          }

          return {
            'data-align': attributes.textAlign,
            'style': resolveImageAlignStyle(attributes.textAlign),
          }
        },
      },
      caption: {
        default: null,
        parseHTML: element => element.getAttribute('data-caption'),
        renderHTML: (attributes) => {
          if (typeof attributes.caption !== 'string' || !attributes.caption.length) {
            return {}
          }

          return {
            'data-caption': attributes.caption,
          }
        },
      },
      src: {
        default: null,
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'img[data-asset-id]',
      },
    ]
  },
})

function resolveImageTextAlign(element: HTMLElement) {
  const textAlign = element.getAttribute('data-align')

  if (isImageTextAlign(textAlign)) {
    return textAlign
  }

  const marginLeft = element.style.marginLeft
  const marginRight = element.style.marginRight

  if (marginLeft === 'auto' && marginRight === 'auto') {
    return 'center'
  }

  if (marginLeft === 'auto') {
    return 'right'
  }

  return undefined
}

function resolveImageAlignStyle(value: 'left' | 'center' | 'right') {
  switch (value) {
    case 'center':
      return 'display: block; margin-left: auto; margin-right: auto;'
    case 'right':
      return 'display: block; margin-left: auto; margin-right: 0;'
    default:
      return 'display: block; margin-left: 0; margin-right: auto;'
  }
}

function isImageTextAlign(value: unknown): value is 'left' | 'center' | 'right' {
  return value === 'left' || value === 'center' || value === 'right'
}
