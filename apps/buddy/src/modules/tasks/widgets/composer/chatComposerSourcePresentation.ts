import type { BuddyComposerDirectory } from '@buddy-shared/conversation/composerResource'
import type { BuddyLocale, BuddyTranslate } from '@/i18n/buddyI18n'
import type { ChatPromptContextOption } from '@/modules/prompt-input'
import { composerPathSeparator, composerReferencePath } from '@buddy-shared/conversation/composerReferencePath'
import { formatFileSize } from '@/shared/lib/formatFileSize'

export function getChatComposerSourceRoot(option: ChatPromptContextOption): string | null {
  if (option.category !== 'space' || !option.path || !option.source || !('bindingId' in option.source))
    return null
  const separator = composerPathSeparator(option.path)
  const relativePath = option.source.relativePath.replaceAll('/', separator)
  if (!option.path.endsWith(`${separator}${relativePath}`))
    return null
  const root = option.path.slice(0, -relativePath.length)
  return root.length === 1 || /^[a-z]:[\\/]$/iu.test(root) ? root : root.slice(0, -1)
}

export function describeChatComposerSource(option: ChatPromptContextOption, language: BuddyLocale, t: BuddyTranslate, root: string | null, browsingDirectory?: string, deepSearch = false): string | null {
  if (option.kind !== 'file')
    return option.description
  const metadata = option.fileMetadata
  const parts: string[] = []
  if (metadata?.messageNumber)
    parts.push(t('desktop.chat.sourcePickerMessage', { value: metadata.messageNumber }))
  if (metadata?.createdAt) {
    const date = new Date(metadata.createdAt)
    if (Number.isFinite(date.getTime()))
      parts.push(new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(date))
  }
  if (metadata?.nameSource === 'clipboard' && option.category === 'current')
    parts.push(t('desktop.chat.sourcePickerClipboard'))
  const path = option.path ? composerReferencePath(option.path, root ?? undefined) : null
  const parent = path ? parentPath(path) : null
  const sameDirectory = !deepSearch && browsingDirectory && option.path && parentPath(option.path) === browsingDirectory && ['space', 'external'].includes(option.category ?? '')
  if (parent && !sameDirectory && parent !== '.')
    parts.push(parent)
  if (option.entryKind === 'directory') {
    parts.push(t('desktop.chat.sourcePickerDirectory'))
  }
  else if (metadata) {
    if (metadata.nameSource === 'clipboard') {
      const format = metadata.mimeType.split('/').at(-1)?.toUpperCase()
      if (format)
        parts.push(format)
    }
    parts.push(formatFileSize(metadata.sizeBytes))
  }
  return parts.join(' · ') || null
}

function parentPath(path: string): string | null {
  const separator = composerPathSeparator(path)
  const index = path.lastIndexOf(separator)
  if (index < 0)
    return null
  return path.slice(0, index === 0 || (index === 2 && path[1] === ':') ? index + 1 : index)
}

export function composerParentDirectory(directory: BuddyComposerDirectory): string | null {
  if (composerReferencePath(directory.path, directory.workingDirectory) === '.')
    return null
  const parent = parentPath(directory.path)
  return parent === directory.path ? null : parent
}

export function composerDirectoryBreadcrumbs(directory: BuddyComposerDirectory): { name: string, path: string }[] {
  if (!directory.workingDirectory)
    return []
  const relative = composerReferencePath(directory.path, directory.workingDirectory)
  if (relative === '.' || relative === directory.path)
    return []
  const parts = relative.split('/')
  const separator = composerPathSeparator(directory.workingDirectory)
  const root = directory.workingDirectory.replace(/[\\/]+$/u, '')
  return parts.map((name, index) => ({ name, path: `${root}${separator}${parts.slice(0, index + 1).join(separator)}` }))
}
