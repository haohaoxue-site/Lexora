import type {
  BrowserAdapterIssueLeaseParams,
  BrowserAdapterLease,
} from '../../../shared/browserAdapterProtocol'
import type { BrowserErrorCode, BrowserRecoveryAction } from '../../../shared/browserProtocol'
import type { RuntimeRpcPeerContract } from '../../../shared/runtimeRpcPeer'
import type { DesktopBrowserState } from '../../shared/desktopApi'
import type { BrowserHost } from './BrowserHost'
import {
  browserAdapterIssueLeaseParamsSchema,
  browserAdapterLeaseSchema,
} from '../../../shared/browserAdapterProtocol'
import {
  browserAcquireControlParamsSchema,
  browserAcquireControlResultSchema,
  browserActParamsSchema,
  browserActResultSchema,
  browserCloseResultSchema,
  browserErrorCodeSchema,
  browserObservationSchema,
  browserObserveParamsSchema,
  browserObserveResultSchema,
  browserOpenParamsSchema,
  browserOpenResultSchema,
  browserReleaseControlParamsSchema,
  browserReleaseControlResultSchema,
  browserSessionParamsSchema,
  browserStateResultSchema,
  browserStateSnapshotSchema,
  browserValidateActionParamsSchema,
  browserValidateActionResultSchema,
} from '../../../shared/browserProtocol'
import { redactBrowserRuntimeUrl } from './browserPrivacy'

interface BrowserResultSchema {
  parse: (value: unknown) => unknown
}

export interface RegisterBrowserHostRpcOptions {
  createAdapterLease?: (input: BrowserAdapterIssueLeaseParams) => BrowserAdapterLease
  getHost: () => BrowserHost | null
}

export function registerBrowserHostRpc(
  peer: RuntimeRpcPeerContract,
  options: RegisterBrowserHostRpcOptions,
): () => void {
  const disposers = [
    peer.onRequest('host.browser.open', async (params) => {
      const input = browserOpenParamsSchema.parse(params)
      return runBrowserHostOperation(
        async () => {
          const host = requireBrowserHost(options.getHost())
          const session = host.ensureSession(input.conversationId)
          return input.target.kind === 'url'
            ? host.navigate(session.sessionId, input.target.url)
            : host.openLocalFile(session.sessionId, {
                entryPath: input.target.entryPath,
                rootPath: input.target.rootPath,
              })
        },
        state => ({ ok: true, state: projectBrowserState(state) }),
        browserOpenResultSchema,
        'open_again',
      )
    }),
    peer.onRequest('host.browser.observe', async (params) => {
      const input = browserObserveParamsSchema.parse(params)
      return runBrowserHostOperation(
        () => requireBrowserHost(options.getHost()).observe(input),
        observation => ({
          observation: browserObservationSchema.parse({
            ...observation,
            url: redactBrowserRuntimeUrl(observation.url),
          }),
          ok: true,
        }),
        browserObserveResultSchema,
        'observe_again',
      )
    }),
    peer.onRequest('host.browser.act', async (params) => {
      const input = browserActParamsSchema.parse(params)
      return runBrowserHostOperation(
        () => requireBrowserHost(options.getHost()).act(input),
        result => ({
          actionKind: result.actionKind,
          ok: true,
          requiresObservation: result.requiresObservation,
          state: projectBrowserState(result.state),
        }),
        browserActResultSchema,
        'observe_again',
      )
    }),
    peer.onRequest('host.browser.validateAction', async (params) => {
      const input = browserValidateActionParamsSchema.parse(params)
      return runBrowserHostOperation(
        () => requireBrowserHost(options.getHost()).validateAction(input),
        () => ({ ok: true }),
        browserValidateActionResultSchema,
        'observe_again',
      )
    }),
    peer.onRequest('host.browser.acquireControl', async (params) => {
      const input = browserAcquireControlParamsSchema.parse(params)
      return runBrowserHostOperation(
        () => requireBrowserHost(options.getHost()).acquireControl(input),
        lease => ({ lease, ok: true }),
        browserAcquireControlResultSchema,
        'request_human_control',
      )
    }),
    peer.onRequest('host.browser.releaseControl', async (params) => {
      const input = browserReleaseControlParamsSchema.parse(params)
      return runBrowserHostOperation(
        () => requireBrowserHost(options.getHost()).releaseControl(input),
        () => ({ ok: true }),
        browserReleaseControlResultSchema,
        'request_human_control',
      )
    }),
    peer.onRequest('host.browser.getState', async (params) => {
      const input = browserSessionParamsSchema.parse(params)
      return runBrowserHostOperation(
        () => requireBrowserHost(options.getHost()).getState(input.sessionId),
        state => ({ ok: true, state: projectBrowserState(state) }),
        browserStateResultSchema,
        'observe_again',
      )
    }),
    peer.onRequest('host.browser.close', async (params) => {
      const input = browserSessionParamsSchema.parse(params)
      return runBrowserHostOperation(
        () => requireBrowserHost(options.getHost()).close(input.sessionId),
        () => ({ ok: true }),
        browserCloseResultSchema,
        null,
      )
    }),
    peer.onRequest('host.browser.createAdapterLease', (params) => {
      const input = browserAdapterIssueLeaseParamsSchema.parse(params)
      if (!options.createAdapterLease) {
        throw Object.assign(new Error('Browser adapter is unavailable'), {
          code: 'BROWSER_SESSION_NOT_FOUND',
        })
      }
      return browserAdapterLeaseSchema.parse(options.createAdapterLease(input))
    }),
  ]
  return () => {
    try {
      options.getHost()?.releaseRuntimeControl()
    }
    catch {}
    disposers.forEach(dispose => dispose())
  }
}

async function runBrowserHostOperation<T>(
  operation: () => Promise<T> | T,
  success: (value: T) => unknown,
  schema: BrowserResultSchema,
  fallbackRecovery: BrowserRecoveryAction | null,
): Promise<unknown> {
  try {
    return schema.parse(success(await operation()))
  }
  catch (error) {
    return schema.parse(browserFailure(error, fallbackRecovery))
  }
}

export function projectBrowserState(state: DesktopBrowserState) {
  return browserStateSnapshotSchema.parse({
    ...state,
    error: state.error
      ? {
          code: state.error.code,
          recovery: browserRecovery(state.error.code, 'observe_again'),
        }
      : null,
    profileMode: state.profileMode,
    url: redactBrowserRuntimeUrl(state.url),
  })
}

function browserFailure(
  error: unknown,
  fallbackRecovery: BrowserRecoveryAction | null,
) {
  const parsedCode = browserErrorCodeSchema.safeParse(
    typeof error === 'object' && error !== null && 'code' in error
      ? error.code
      : null,
  )
  const code = parsedCode.success ? parsedCode.data : 'BROWSER_PAGE_FAILED'
  return {
    error: {
      code,
      recovery: browserRecovery(code, fallbackRecovery),
    },
    ok: false,
  } as const
}

function browserRecovery(
  code: BrowserErrorCode,
  fallback: BrowserRecoveryAction | null,
): BrowserRecoveryAction | null {
  switch (code) {
    case 'BROWSER_CONTROL_REQUIRED':
    case 'BROWSER_DIALOG_PENDING':
    case 'BROWSER_HUMAN_INPUT_REQUIRED':
      return 'request_human_control'
    case 'BROWSER_LOCAL_SERVER_UNREACHABLE':
      return 'start_local_server'
    case 'BROWSER_PAGE_CRASHED':
    case 'BROWSER_SESSION_EVICTED':
    case 'BROWSER_SESSION_NOT_FOUND':
      return 'open_again'
    case 'BROWSER_PAGE_UNRESPONSIVE':
    case 'BROWSER_TARGET_STALE':
      return 'observe_again'
    case 'BROWSER_PAGE_FAILED':
      return fallback
    default:
      return null
  }
}

function requireBrowserHost(host: BrowserHost | null): BrowserHost {
  if (!host) {
    throw Object.assign(new Error('Browser host is unavailable'), {
      code: 'BROWSER_SESSION_NOT_FOUND',
    })
  }
  return host
}
