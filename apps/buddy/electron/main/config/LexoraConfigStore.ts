import type { ZodError } from 'zod'
import type { LexoraConfig, LexoraConfigPatch } from '../../shared/desktopApi'
import { randomUUID } from 'node:crypto'
import { chmod, mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import process from 'node:process'
import { parse, stringify } from 'smol-toml'
import { z } from 'zod'

const chatSidebarPinnedItemSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string().min(1).max(128), kind: z.literal('conversation') }).strict(),
  z.object({ id: z.string().min(1).max(128), kind: z.literal('project') }).strict(),
])

const desktopConfigSchema = z.object({
  background_close_notice_shown: z.boolean().default(false),
  chat_sidebar_pinned_items: z.array(chatSidebarPinnedItemSchema)
    .max(500)
    .refine(items => new Set(items.map(item => `${item.kind}:${item.id}`)).size === items.length)
    .default([]),
  developer_tools_enabled: z.boolean().default(false),
  language: z.enum(['zh-CN', 'en-US']).default('zh-CN'),
  launch_at_login: z.boolean().default(false),
  notifications_enabled: z.boolean().default(true),
  notify_when_focused: z.boolean().default(false),
  sidebar_collapsed: z.boolean().default(false),
  theme: z.enum(['system', 'light', 'dark']).default('system'),
}).passthrough().default({
  background_close_notice_shown: false,
  chat_sidebar_pinned_items: [],
  developer_tools_enabled: false,
  language: 'zh-CN',
  launch_at_login: false,
  notifications_enabled: true,
  notify_when_focused: false,
  sidebar_collapsed: false,
  theme: 'system',
})

const petConfigSchema = z.object({
  always_on_top: z.boolean().default(true),
  enabled: z.boolean().default(true),
  remember_position: z.boolean().default(true),
}).passthrough().default({
  always_on_top: true,
  enabled: true,
  remember_position: true,
})

const lexoraConfigFileSchema = z.object({
  desktop: desktopConfigSchema,
  pet: petConfigSchema,
}).passthrough()

export class LexoraConfigError extends Error {
  readonly code = 'INVALID_CONFIG'

  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'LexoraConfigError'
  }
}

export class LexoraConfigStore {
  readonly #configPath: string
  #writeQueue: Promise<void> = Promise.resolve()

  constructor(options: { configPath: string }) {
    this.#configPath = options.configPath
  }

  async read(): Promise<LexoraConfig> {
    return decodeConfig(await this.#readFile())
  }

  update(patch: LexoraConfigPatch): Promise<LexoraConfig> {
    const operation = this.#writeQueue.then(async () => {
      const file = await this.#readFile()
      const next = mergeConfig(decodeConfig(file), patch)
      await this.#write(mergeConfigFile(file, next))
      return next
    })

    this.#writeQueue = operation.then(() => undefined, () => undefined)
    return operation
  }

  async #readFile(): Promise<unknown> {
    let content: string

    try {
      content = await readFile(this.#configPath, 'utf8')
    }
    catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT')
        return {}

      throw error
    }

    try {
      return content.trim() ? parse(content) : {}
    }
    catch (error) {
      throw createConfigError(error)
    }
  }

  async #write(config: Record<string, unknown>): Promise<void> {
    const parent = dirname(this.#configPath)
    const temporaryPath = `${this.#configPath}.${process.pid}.${randomUUID()}.tmp`
    const content = stringify(config)

    await mkdir(parent, { mode: 0o700, recursive: true })

    try {
      const handle = await open(temporaryPath, 'wx', 0o600)
      try {
        await handle.writeFile(content, 'utf8')
        await handle.sync()
      }
      finally {
        await handle.close()
      }

      await rename(temporaryPath, this.#configPath)
      await chmod(this.#configPath, 0o600)
    }
    finally {
      await rm(temporaryPath, { force: true })
    }
  }
}

function decodeConfig(value: unknown): LexoraConfig {
  let config: z.infer<typeof lexoraConfigFileSchema>

  try {
    config = lexoraConfigFileSchema.parse(value)
  }
  catch (error) {
    throw createConfigError(error)
  }

  return {
    desktop: {
      backgroundCloseNoticeShown: config.desktop.background_close_notice_shown,
      chatSidebarPinnedItems: config.desktop.chat_sidebar_pinned_items,
      developerToolsEnabled: config.desktop.developer_tools_enabled,
      language: config.desktop.language,
      launchAtLogin: config.desktop.launch_at_login,
      notificationsEnabled: config.desktop.notifications_enabled,
      notifyWhenFocused: config.desktop.notify_when_focused,
      sidebarCollapsed: config.desktop.sidebar_collapsed,
      theme: config.desktop.theme,
    },
    pet: {
      alwaysOnTop: config.pet.always_on_top,
      enabled: config.pet.enabled,
      rememberPosition: config.pet.remember_position,
    },
  }
}

function encodeConfig(config: LexoraConfig) {
  return {
    desktop: {
      background_close_notice_shown: config.desktop.backgroundCloseNoticeShown,
      chat_sidebar_pinned_items: config.desktop.chatSidebarPinnedItems,
      developer_tools_enabled: config.desktop.developerToolsEnabled,
      language: config.desktop.language,
      launch_at_login: config.desktop.launchAtLogin,
      notifications_enabled: config.desktop.notificationsEnabled,
      notify_when_focused: config.desktop.notifyWhenFocused,
      sidebar_collapsed: config.desktop.sidebarCollapsed,
      theme: config.desktop.theme,
    },
    pet: {
      always_on_top: config.pet.alwaysOnTop,
      enabled: config.pet.enabled,
      remember_position: config.pet.rememberPosition,
    },
  }
}

function mergeConfig(current: LexoraConfig, patch: LexoraConfigPatch): LexoraConfig {
  return {
    desktop: {
      ...current.desktop,
      ...patch.desktop,
    },
    pet: {
      ...current.pet,
      ...patch.pet,
    },
  }
}

function mergeConfigFile(file: unknown, config: LexoraConfig): Record<string, unknown> {
  const root = asRecord(file)
  const desktop = asRecord(root.desktop)
  const pet = asRecord(root.pet)
  const encoded = encodeConfig(config)
  const nextDesktop: Record<string, unknown> = {
    ...desktop,
    ...encoded.desktop,
  }
  delete nextDesktop.chat_sidebar_section_order
  const next: Record<string, unknown> = {
    ...root,
    desktop: nextDesktop,
    pet: {
      ...pet,
      ...encoded.pet,
    },
  }
  delete next.agent
  return next
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function createConfigError(error: unknown): LexoraConfigError {
  const message = isZodError(error)
    ? error.issues.map(issue => `${issue.path.join('.') || 'config'}: ${issue.message}`).join('; ')
    : error instanceof Error ? error.message : 'Invalid Lexora configuration'

  return new LexoraConfigError(message, { cause: error })
}

function isZodError(error: unknown): error is ZodError {
  return error instanceof z.ZodError
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
