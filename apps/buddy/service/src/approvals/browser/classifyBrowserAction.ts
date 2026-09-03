import type {
  BrowserAction,
  BrowserObservedElement,
} from '../../../../shared/browserProtocol'

export type BrowserActionRisk
  = 'commit-like'
    | 'navigation'
    | 'read'
    | 'reversible-edit'
    | 'sensitive-input'
    | 'unknown-commit-like'

export type BrowserCommitEffect
  = 'account-change'
    | 'authorize'
    | 'delete'
    | 'publish'
    | 'purchase'
    | 'send'
    | 'submit'

type BrowserActionClassificationWithoutEffect = {
  [Risk in Exclude<BrowserActionRisk, 'commit-like'>]: { risk: Risk }
}[Exclude<BrowserActionRisk, 'commit-like'>]

export type BrowserActionClassification
  = { effect: BrowserCommitEffect, risk: 'commit-like' }
    | BrowserActionClassificationWithoutEffect

export interface ClassifyBrowserActionInput {
  action: BrowserAction
  observationContainsHumanInput: boolean
  target: BrowserObservedElement | null
}

const COMMIT_EFFECT_RULES: ReadonlyArray<{
  effect: BrowserCommitEffect
  pattern: RegExp
}> = [
  {
    effect: 'account-change',
    pattern: /\b(?:(?:create|delete|remove)\s+account|change\s+(?:email|password|plan)|log\s*in|sign\s*in|subscribe|unsubscribe)\b|登录|注册|创建账户|删除账户|注销账户|修改(?:邮箱|密码|套餐)|订阅|退订/i,
  },
  {
    effect: 'authorize',
    pattern: /\b(?:approve|authorize|grant)\b|授权|批准/i,
  },
  {
    effect: 'delete',
    pattern: /\b(?:confirm\s+deletion|delete|remove)\b|删除|移除|确认删除/i,
  },
  {
    effect: 'purchase',
    pattern: /\b(?:buy|confirm\s+(?:booking|order|payment|purchase|reservation|transfer)|pay|place\s+(?:bid|order)|purchase|transfer)\b|购买|付款|支付|下单|确认(?:订单|付款|支付|购买|预订|转账)|转账/i,
  },
  {
    effect: 'publish',
    pattern: /\bpublish\b|发布/i,
  },
  {
    effect: 'send',
    pattern: /\bsend\b|发送/i,
  },
  {
    effect: 'submit',
    pattern: /\bsubmit\b|提交/i,
  },
]

export function classifyBrowserAction(
  input: ClassifyBrowserActionInput,
): BrowserActionClassification {
  const { action, target } = input
  if (
    (target?.inputMode === 'human' && action.kind !== 'scroll' && action.kind !== 'wait')
    || (
      action.kind === 'press'
      && !action.ref
      && input.observationContainsHumanInput
    )
  ) {
    return { risk: 'sensitive-input' }
  }

  switch (action.kind) {
    case 'back':
    case 'forward':
    case 'reload':
    case 'scroll':
    case 'stop':
    case 'wait':
      return { risk: 'read' }
    case 'navigate':
      return { risk: 'navigation' }
    case 'fill':
    case 'select':
    case 'type':
      return { risk: 'reversible-edit' }
    case 'click':
      return classifyActivation(target)
    case 'press':
      return classifyPress(action, target)
  }
}

function classifyActivation(
  target: BrowserObservedElement | null,
): BrowserActionClassification {
  const effect = readCommitEffect(target?.name)
  if (effect)
    return { effect, risk: 'commit-like' }
  return { risk: 'unknown-commit-like' }
}

function classifyPress(
  action: Extract<BrowserAction, { kind: 'press' }>,
  target: BrowserObservedElement | null,
): BrowserActionClassification {
  if (action.key === 'Enter') {
    return classifyActivation(target)
  }
  if (action.key === 'Space') {
    if (!target)
      return { risk: 'unknown-commit-like' }
    return classifyActivation(target)
  }
  if (action.key === 'Backspace' || action.key === 'Delete')
    return { risk: 'reversible-edit' }
  return { risk: 'read' }
}

function readCommitEffect(name: string | undefined): BrowserCommitEffect | null {
  if (!name)
    return null
  const normalizedName = name.normalize('NFKC')
  return COMMIT_EFFECT_RULES.find(rule => rule.pattern.test(normalizedName))?.effect ?? null
}
