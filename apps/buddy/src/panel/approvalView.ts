import type { BuddyApproval, BuddyApprovalStatus } from '@/lib/tauriRuntime'

export interface BuddyApprovalViewRow {
  id: string
  kind: string
  runId: string | null
  approveLabel: string
  canApprove: boolean
  canDeny: boolean
  kindLabel: string
  methodLabel: string
  statusLabel: string
  promptPreview: string
  scopeLabel: string
  scopeStatusLabel: string
  targetLabel: string
  createdAt: string
}

const APPROVAL_KIND_LABELS: Record<string, string> = {
  'run.codex_app_server_request': 'Codex 请求',
  'run.read_only_task': '只读任务',
}

const APPROVAL_STATUS_LABELS: Record<BuddyApprovalStatus, string> = {
  approved: '已确认',
  cancelled: '已取消',
  denied: '已拒绝',
  pending: '等待确认',
}

const CODEX_METHOD_LABELS: Record<string, string> = {
  'item/commandExecution/requestApproval': '命令执行',
  'item/fileChange/requestApproval': '文件修改',
  'item/permissions/requestApproval': '权限提升',
  'mcpServer/elicitation/request': '外部输入',
}

const CODEX_SCOPE_STATUS_LABELS: Record<string, string> = {
  authorized: '授权项目内',
  invalid_path: '路径无效',
  outside_authorized_project: '超出授权项目',
  trusted_buddy_capability: 'Buddy 内置能力',
  unsupported_request: '不支持的请求',
}

export function createApprovalViewRows(
  approvals: ReadonlyArray<BuddyApproval>,
): ReadonlyArray<BuddyApprovalViewRow> {
  return approvals.map((approval) => {
    const scopeDecision = readPayloadString(approval.payload, 'scopeDecision')
    const method = readPayloadString(approval.payload, 'method')
    const cwd = readPayloadString(approval.payload, 'cwd') ?? '全局'
    const targetRoot = readPayloadString(approval.payload, 'targetRoot') ?? cwd
    const scopeStatus = readPayloadString(approval.payload, 'scopeStatus')

    return {
      approveLabel: approval.kind === 'run.codex_app_server_request' ? '允许' : '确认执行',
      canApprove: approval.status === 'pending' && scopeDecision !== 'auto_denied',
      canDeny: approval.status === 'pending',
      createdAt: approval.createdAt,
      id: approval.id,
      kind: approval.kind,
      kindLabel: APPROVAL_KIND_LABELS[approval.kind] ?? approval.kind,
      methodLabel: method ? CODEX_METHOD_LABELS[method] ?? method : '任务审批',
      promptPreview: readPayloadString(approval.payload, 'promptPreview') ?? '无任务摘要',
      runId: approval.runId,
      scopeLabel: cwd,
      scopeStatusLabel: scopeStatus
        ? CODEX_SCOPE_STATUS_LABELS[scopeStatus] ?? scopeStatus
        : '待确认',
      statusLabel: APPROVAL_STATUS_LABELS[approval.status],
      targetLabel: targetRoot,
    }
  })
}

function readPayloadString(payload: unknown, key: string) {
  if (typeof payload !== 'object' || payload === null)
    return null

  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}
