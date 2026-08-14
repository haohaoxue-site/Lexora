import type { LexoraConfigPatch } from './desktopApi'
import { z } from 'zod'

const chatSidebarSectionOrderSchema = z.tuple([
  z.enum(['recent', 'projects']),
  z.enum(['recent', 'projects']),
]).refine(([first, second]) => first !== second)

export const feedbackIssueInputSchema = z.object({
  feedback: z.string().max(4_000),
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
    chatSidebarSectionOrder: chatSidebarSectionOrderSchema.optional(),
    language: z.enum(['zh-CN', 'en-US']).optional(),
    launchAtLogin: z.boolean().optional(),
    notificationsEnabled: z.boolean().optional(),
    notifyWhenFocused: z.boolean().optional(),
    sidebarCollapsed: z.boolean().optional(),
    theme: z.enum(['system', 'light', 'dark']).optional(),
  }).strict().optional(),
  pet: z.object({
    alwaysOnTop: z.boolean().optional(),
    enabled: z.boolean().optional(),
    rememberPosition: z.boolean().optional(),
  }).strict().optional(),
}).strict()
