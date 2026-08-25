import type { LexoraConfigPatch } from './desktopApi'
import { z } from 'zod'
import { DESKTOP_CHAT_WELCOME_VARIANT_IDS } from './desktopApi'

const taskSidebarPinnedItemSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string().min(1).max(128), kind: z.literal('conversation') }).strict(),
  z.object({ id: z.string().min(1).max(128), kind: z.literal('project') }).strict(),
])

const taskSidebarPinnedItemsSchema = z.array(taskSidebarPinnedItemSchema)
  .max(500)
  .refine(items => new Set(items.map(item => `${item.kind}:${item.id}`)).size === items.length)

export const feedbackIssueInputSchema = z.object({
  feedback: z.string().max(4_000),
}).strict()

export const clipboardWriteTextInputSchema = z.object({
  text: z.string(),
}).strict()

export const releasePageInputSchema = z.object({
  url: z.url().refine((value) => {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.hostname === 'github.com'
      && url.pathname.startsWith('/haohaoxue-site/Lexora/releases/')
  }),
}).strict()

export const lexoraConfigPatchSchema: z.ZodType<LexoraConfigPatch> = z.object({
  desktop: z.object({
    backgroundCloseNoticeShown: z.boolean().optional(),
    taskSidebarPinnedItems: taskSidebarPinnedItemsSchema.optional(),
    developerToolsEnabled: z.boolean().optional(),
    language: z.enum(['zh-CN', 'en-US']).optional(),
    launchAtLogin: z.boolean().optional(),
    notificationsEnabled: z.boolean().optional(),
    notifyWhenFocused: z.boolean().optional(),
    sidebarCollapsed: z.boolean().optional(),
    theme: z.enum(['system', 'light', 'dark']).optional(),
    welcomeVariant: z.enum(['random', ...DESKTOP_CHAT_WELCOME_VARIANT_IDS]).optional(),
  }).strict().optional(),
  pet: z.object({
    alwaysOnTop: z.boolean().optional(),
    enabled: z.boolean().optional(),
    rememberPosition: z.boolean().optional(),
  }).strict().optional(),
}).strict()
