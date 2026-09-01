import type { DirectoryGrant, GrantedPathMode } from '../directories/resolveGrantedPath'
import type {
  ShellCommandPolicy,
  ToolApprovalKind,
  ToolDecision,
  ToolPolicyPath,
  ToolPolicyRequest,
} from './toolPolicyContract'
import { isAbsolute, resolve } from 'node:path'
import process from 'node:process'

import { GrantedPathError, resolveGrantedPath } from '../directories/resolveGrantedPath'
import { ShellPolicy } from './ShellPolicy'

export interface ToolPolicyOptions {
  platform?: NodeJS.Platform
  shellPolicies?: Partial<Record<ShellToolName, ShellCommandPolicy>>
}

type ShellToolName = 'bash' | 'powershell'

export class ToolPolicy {
  readonly #shellPolicies: Readonly<Record<ShellToolName, ShellCommandPolicy>>

  constructor(options: ToolPolicyOptions = {}) {
    const platform = options.platform ?? process.platform
    this.#shellPolicies = {
      bash: options.shellPolicies?.bash ?? new ShellPolicy({ dialect: 'bash', platform }),
      powershell: options.shellPolicies?.powershell
        ?? new ShellPolicy({ dialect: 'powershell', platform }),
    }
  }

  async decide(request: ToolPolicyRequest): Promise<ToolDecision> {
    try {
      return await this.#decide(request)
    }
    catch (error) {
      if (error instanceof ToolPolicyValidationError)
        return { type: 'deny', code: 'VALIDATION_FAILED' }
      throw error
    }
  }

  async #decide(request: ToolPolicyRequest): Promise<ToolDecision> {
    if (request.resource && !request.resource.trusted && request.resource.kind !== 'connector')
      return { type: 'deny', code: 'UNTRUSTED_RESOURCE' }

    const cwdDecision = await this.#validatePaths(request.grants, request.cwd, [{
      mode: 'existing',
      path: request.cwd,
    }])
    if (cwdDecision)
      return cwdDecision

    const declaredPathDecision = await this.#validatePaths(
      request.grants,
      request.cwd,
      request.paths ?? [],
    )
    if (declaredPathDecision)
      return declaredPathDecision

    if (request.source === 'mcp' && request.risk === 'read' && request.resource?.trusted)
      return { type: 'allow' }
    if (request.source === 'mcp' || request.risk === 'mcp')
      return ask('mcp', 'Use a connected external tool')
    if (request.risk === 'authorization') {
      return request.source === 'lexora'
        ? { type: 'allow' }
        : { type: 'deny', code: 'VALIDATION_FAILED' }
    }
    if (request.source === 'lexora' && request.risk === 'read')
      return { type: 'allow' }

    switch (request.toolName) {
      case 'read':
        return this.#decideFileTool(request, 'existing')
      case 'write':
        return this.#decideFileTool(request, 'create')
      case 'edit':
        return this.#decideFileTool(request, 'existing')
      case 'grep':
      case 'find':
      case 'ls':
        return this.#decideOptionalPathTool(request)
      case 'bash':
      case 'powershell':
        return this.#shellPolicies[request.toolName].decide(
          readStringProperty(request.arguments, 'command'),
        )
    }

    switch (request.risk) {
      case 'visual':
        return { type: 'allow' }
      case 'read':
      case 'write':
        if (!request.paths?.length)
          throw new ToolPolicyValidationError()
        return { type: 'allow' }
      case 'delete':
        return ask('delete', 'Delete content from the authorized directory')
      case 'network':
        return ask('network', 'Access an external network resource')
      case 'system':
        return ask('system', 'Change local system state')
      case undefined:
        return ask('system', 'Use a tool with unknown local side effects')
    }
  }

  async #decideFileTool(
    request: ToolPolicyRequest,
    mode: GrantedPathMode,
  ): Promise<ToolDecision> {
    const path = readStringProperty(request.arguments, 'path')
    return (await this.#validatePaths(request.grants, request.cwd, [{ mode, path }]))
      ?? { type: 'allow' }
  }

  async #decideOptionalPathTool(request: ToolPolicyRequest): Promise<ToolDecision> {
    const path = readOptionalStringProperty(request.arguments, 'path') ?? request.cwd
    return (await this.#validatePaths(request.grants, request.cwd, [{
      mode: 'existing',
      path,
    }])) ?? { type: 'allow' }
  }

  async #validatePaths(
    grants: readonly DirectoryGrant[],
    cwd: string,
    paths: readonly ToolPolicyPath[],
  ): Promise<Extract<ToolDecision, { type: 'deny' }> | null> {
    for (const path of paths) {
      const absolutePath = isAbsolute(path.path) ? path.path : resolve(cwd, path.path)
      try {
        await resolveGrantedPath(grants, absolutePath, path.mode)
      }
      catch (error) {
        if (error instanceof GrantedPathError)
          return { type: 'deny', code: error.code }
        throw error
      }
    }
    return null
  }
}

class ToolPolicyValidationError extends Error {
  constructor() {
    super('Lexora Buddy tool input is invalid')
    this.name = 'ToolPolicyValidationError'
  }
}

function ask(kind: ToolApprovalKind, summary: string): ToolDecision {
  return { type: 'ask', kind, summary }
}

function readStringProperty(value: unknown, key: string): string {
  const property = readOptionalStringProperty(value, key)
  if (property === undefined)
    throw new ToolPolicyValidationError()
  return property
}

function readOptionalStringProperty(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ToolPolicyValidationError()
  const property = (value as Record<string, unknown>)[key]
  if (property === undefined)
    return undefined
  if (typeof property !== 'string' || !property.trim())
    throw new ToolPolicyValidationError()
  return property
}
