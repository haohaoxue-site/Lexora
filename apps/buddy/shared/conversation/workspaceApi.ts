import type { RuntimeRequestContract } from '../runtime/apiContract'
import type { DeepReadonly } from '../runtime/apiValidation'
import { z } from 'zod'
import { approvalPolicySchema, executionProfileSchema, sessionIdentitySchema, timestampSchema } from '../runtime/apiValidation'
import { attachmentSchema } from './attachmentApi'

export const workspaceDraftSchema = z.object({
  approvalPolicy: approvalPolicySchema,
  attachments: z.array(attachmentSchema),
  composerContent: z.json().nullable(),
  content: z.string(),
  draftId: sessionIdentitySchema,
  executionProfile: executionProfileSchema,
  requestFingerprint: z.string().min(1).max(1024).nullable(),
  requestId: z.string().min(1).max(128).nullable(),
  targetKey: z.string().min(1),
}).strict()

export const LOCAL_WORKSPACE_STATE_KEY = 'buddy.chat.workspace.v2' as const

export const legacyWorkspaceStateValueSchema = z.object({
  activeConversationId: z.string().nullable(),
  drafts: z.array(workspaceDraftSchema),
  spaceId: z.string().nullable(),
}).strict()

export const localWorkspaceStateValueSchema = z.object({
  activeConversationId: z.string().nullable(),
  spaceId: z.string().nullable(),
}).strict()

export const workspaceSettingSchema = z.object({
  key: z.literal(LOCAL_WORKSPACE_STATE_KEY),
  updatedAt: timestampSchema,
  value: z.union([localWorkspaceStateValueSchema, legacyWorkspaceStateValueSchema]),
}).strict()

export type LocalWorkspaceDraft = DeepReadonly<z.infer<typeof workspaceDraftSchema>>

export type LocalWorkspaceSetting = DeepReadonly<z.infer<typeof workspaceSettingSchema>>

export type LocalWorkspaceStateValue = DeepReadonly<z.infer<typeof localWorkspaceStateValueSchema>>

export const workspaceRequestSchemas = {
  workspaceValue: z.object({ value: localWorkspaceStateValueSchema }).strict(),
} as const

export const workspaceResponseSchemas = {
  optionalWorkspaceSetting: workspaceSettingSchema.nullable(),
  workspaceSetting: workspaceSettingSchema,
} as const

export const workspaceStateRpc = {
  read: { method: 'workspaceState.read', input: z.object({ key: z.literal(LOCAL_WORKSPACE_STATE_KEY) }).strict(), response: workspaceResponseSchemas.optionalWorkspaceSetting },
  write: { method: 'workspaceState.write', input: z.object({ key: z.literal(LOCAL_WORKSPACE_STATE_KEY), value: z.unknown() }).strict(), response: workspaceResponseSchemas.workspaceSetting },
} as const satisfies Record<string, RuntimeRequestContract>
