import type {
  AgentRunCommand,
  AgentRunControlCommand,
  AgentRunControlResult,
  AgentRunEvent,
  AgentRunEventType,
  AgentRunModelTarget,
  AgentWorkflowKey,
} from '@haohaoxue/samepage-contracts'

export type {
  AgentRunCommand,
  AgentRunControlCommand,
  AgentRunControlResult,
  AgentRunEvent,
  AgentRunEventType,
  AgentRunModelTarget,
  AgentWorkflowKey,
}

export type AgentCommandHandler = (command: AgentRunCommand) => Promise<void> | void
export type AgentControlHandler = (control: AgentRunControlCommand) => Promise<void> | void

export interface AgentCommandQueue {
  publish: (command: AgentRunCommand) => Promise<void>
  publishControl?: (control: AgentRunControlCommand) => Promise<void>
  subscribe: (handler: AgentCommandHandler) => () => void
  subscribeControl?: (handler: AgentControlHandler) => () => void
  ready?: () => Promise<void>
  close?: () => Promise<void>
}

export interface AgentEventPublisher {
  publish: (event: AgentRunEvent) => Promise<void>
  close?: () => Promise<void>
}

export interface AgentControlResultPublisher {
  publish: (result: AgentRunControlResult) => Promise<void>
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
