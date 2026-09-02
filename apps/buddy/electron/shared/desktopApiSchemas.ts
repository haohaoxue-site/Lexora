import type {
  DesktopBrowserEnsureSessionInput,
  DesktopBrowserNavigateInput,
  DesktopBrowserOpenLocalFileInput,
  DesktopBrowserSecurityState,
  DesktopBrowserSessionInput,
  DesktopBrowserSetSurfaceInput,
  DesktopBrowserState,
  LexoraConfigPatch,
} from './desktopApi'
import { z } from 'zod'
import {
  DESKTOP_BROWSER_ERROR_CODES,
  DESKTOP_BROWSER_PROFILE_MODES,
  DESKTOP_BROWSER_SECURITY_KINDS,
  DESKTOP_CHAT_WELCOME_VARIANT_IDS,
} from './desktopApi'

const browserConversationIdSchema = z.string().trim().min(1).max(128)
const browserSessionIdSchema = z.uuid()
const browserUrlSchema = z.string().trim().min(1).max(4_096).refine((value) => {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  }
  catch {
    return false
  }
})
const browserOriginSchema = z.string().min(1).max(4_096).refine((value) => {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && url.origin === value
  }
  catch {
    return false
  }
})

const browserBoundsSchema = z.object({
  height: z.number().int().min(1).max(32_768),
  width: z.number().int().min(1).max(32_768),
  x: z.number().int().min(0).max(32_768),
  y: z.number().int().min(0).max(32_768),
}).strict()

export const browserEnsureSessionInputSchema: z.ZodType<DesktopBrowserEnsureSessionInput>
  = z.object({ conversationId: browserConversationIdSchema }).strict()

export const browserNavigateInputSchema: z.ZodType<DesktopBrowserNavigateInput> = z.object({
  sessionId: browserSessionIdSchema,
  url: browserUrlSchema,
}).strict()

export const browserOpenLocalFileInputSchema: z.ZodType<DesktopBrowserOpenLocalFileInput>
  = z.object({ sessionId: browserSessionIdSchema }).strict()

export const browserSetSurfaceInputSchema: z.ZodType<DesktopBrowserSetSurfaceInput>
  = z.discriminatedUnion('visible', [
    z.object({
      bounds: browserBoundsSchema,
      sessionId: browserSessionIdSchema,
      visible: z.literal(true),
    }).strict(),
    z.object({
      sessionId: browserSessionIdSchema,
      visible: z.literal(false),
    }).strict(),
  ])

export const browserSessionInputSchema: z.ZodType<DesktopBrowserSessionInput> = z.object({
  sessionId: browserSessionIdSchema,
}).strict()

const desktopBrowserSecurityStateSchema: z.ZodType<DesktopBrowserSecurityState>
  = z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('blank'),
      origin: z.null(),
    }).strict(),
    z.object({
      kind: z.enum(DESKTOP_BROWSER_SECURITY_KINDS.filter(kind => kind !== 'blank')),
      origin: browserOriginSchema,
    }).strict(),
  ])

export const desktopBrowserStateSchema: z.ZodType<DesktopBrowserState> = z.object({
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
  controller: z.enum(['agent', 'human']),
  controlEpoch: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  conversationId: browserConversationIdSchema,
  error: z.object({
    code: z.enum(DESKTOP_BROWSER_ERROR_CODES),
    message: z.string().max(1_024),
  }).strict().nullable(),
  pageId: z.uuid(),
  profileMode: z.enum(DESKTOP_BROWSER_PROFILE_MODES),
  security: desktopBrowserSecurityStateSchema,
  sessionId: browserSessionIdSchema,
  status: z.enum(['error', 'idle', 'loading', 'ready']),
  title: z.string().max(512),
  url: z.union([z.literal('about:blank'), browserUrlSchema]),
  visible: z.boolean(),
}).strict()

const taskSidebarPinnedItemSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string().min(1).max(128), kind: z.literal('conversation') }).strict(),
  z.object({ id: z.string().min(1).max(128), kind: z.literal('space') }).strict(),
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
