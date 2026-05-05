import type {
  AgentRunCommand,
  AgentRunEvent,
  AgentRunEventType,
  AgentRunModelTarget,
  AgentWorkflowKey,
} from '@haohaoxue/samepage-contracts'

export type { AgentRunCommand, AgentRunEvent, AgentRunEventType, AgentRunModelTarget, AgentWorkflowKey }

export type AgentCommandHandler = (command: AgentRunCommand) => Promise<void> | void

export interface AgentCommandQueue {
  publish: (command: AgentRunCommand) => Promise<void>
  subscribe: (handler: AgentCommandHandler) => () => void
  ready?: () => Promise<void>
  close?: () => Promise<void>
}

export interface AgentEventPublisher {
  publish: (event: AgentRunEvent) => Promise<void>
  close?: () => Promise<void>
}

export interface AgentWorkflowExecuteOptions {
  actorId: string
  runId: string
  workflowKey: AgentWorkflowKey
  context: Record<string, unknown>
  payload: unknown
  modelTarget: AgentRunModelTarget | null
  signal: AbortSignal
  emit: (event: AgentRunEvent) => Promise<void> | void
}

export interface AgentWorkflow {
  workflowKey: AgentWorkflowKey
  execute: (options: AgentWorkflowExecuteOptions) => Promise<unknown>
}
