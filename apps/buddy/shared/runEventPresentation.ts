import { z } from 'zod'

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
    card: z.literal('pet'),
    description: z.string().min(1).max(4 * 1024).nullable(),
    macro: z.string().min(1).max(256),
    status: z.string().min(1).max(256),
  }).strict(),
])

export type BuddyToolPresentation = z.infer<typeof buddyToolPresentationSchema>
