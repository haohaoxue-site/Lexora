import { z } from 'zod'
import { BUDDY_ATTACHMENT_COUNT_LIMIT } from './attachmentPolicy'

const previewSchema = z.object({
  description: z.string().min(1).max(4 * 1024).nullable(),
  output: z.string().max(64 * 1024).nullable(),
  truncated: z.boolean(),
}).strict()

const pathSchema = z.string().min(1).max(4_096)

export const buddyToolPresentationSchema = z.discriminatedUnion('card', [
  previewSchema.extend({
    argumentNames: z.array(z.string().min(1).max(256)).max(32),
    card: z.literal('generic'),
  }).strict(),
  previewSchema.extend({
    card: z.literal('terminal'),
    command: z.string().max(4 * 1024),
    cwd: pathSchema.nullable(),
    exitCode: z.number().int().nullable(),
    signal: z.string().min(1).max(128).nullable(),
  }).strict(),
  previewSchema.extend({
    card: z.literal('read'),
    language: z.string().min(1).max(128).nullable(),
    lineStart: z.number().int().positive(),
    path: pathSchema,
  }).strict(),
  previewSchema.extend({
    card: z.literal('search'),
    glob: z.string().min(1).max(4 * 1024).nullable(),
    path: pathSchema.nullable(),
    query: z.string().max(4 * 1024),
  }).strict(),
  previewSchema.extend({
    card: z.literal('diff'),
    diff: z.string().max(64 * 1024).nullable(),
    firstChangedLine: z.number().int().positive().nullable(),
    operation: z.enum(['created', 'edited']),
    path: pathSchema,
  }).strict(),
  previewSchema.extend({
    argumentNames: z.array(z.string().min(1).max(256)).max(32),
    card: z.literal('connector'),
    connector: z.string().min(1).max(256),
    tool: z.string().min(1).max(256),
  }).strict(),
  z.object({
    artifactIds: z.array(z.string().min(1).max(256)).max(BUDDY_ATTACHMENT_COUNT_LIMIT),
    card: z.literal('image'),
    description: z.string().min(1).max(4 * 1024).nullable(),
    generatedCount: z.number().int().nonnegative().nullable(),
    prompt: z.string().min(1).max(32 * 1024).nullable(),
    reference: z.discriminatedUnion('mode', [
      z.object({
        resourceIds: z.array(z.string().min(1).max(256)).max(4),
        mode: z.literal('resources'),
      }).strict(),
      z.object({
        mode: z.literal('latest'),
      }).strict(),
    ]).nullable(),
    status: z.enum(['completed', 'failed', 'running']),
  }).strict(),
  z.object({
    card: z.literal('pet'),
    description: z.string().min(1).max(4 * 1024).nullable(),
    macro: z.string().min(1).max(256),
    status: z.string().min(1).max(256),
  }).strict(),
  z.object({
    automationId: z.string().min(1).max(256).nullable(),
    card: z.literal('automation'),
    itemCount: z.number().int().nonnegative().nullable(),
    name: z.string().min(1).max(80).nullable(),
    nextRunAt: z.iso.datetime().nullable(),
    occurrenceId: z.string().min(1).max(256).nullable(),
    operation: z.enum(['list', 'get', 'upsert', 'pause', 'resume', 'delete', 'run_now']),
    status: z.string().min(1).max(256).nullable(),
  }).strict(),
  previewSchema.extend({
    action: z.enum([
      'kill-process',
      'restart-service',
      'start-service',
      'stop-service',
      'terminate-process',
    ]),
    card: z.literal('system'),
    status: z.string().min(1).max(256).nullable(),
    target: z.string().min(1).max(256).nullable(),
    verified: z.boolean().nullable(),
  }).strict(),
])

export type BuddyToolPresentation = z.infer<typeof buddyToolPresentationSchema>
