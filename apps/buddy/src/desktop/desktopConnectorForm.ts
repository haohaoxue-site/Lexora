import type {
  LocalConnector,
  LocalConnectorConfig,
  LocalConnectorCredential,
  LocalConnectorCredentialMutation,
} from '../../electron/shared/localChatApi'

const ENVIRONMENT_KEY_PATTERN = /^[A-Z_]\w*$/i
const HTTP_HEADER_NAME_PATTERN = /^[!#$%&'*+.^\w`|~-]+$/

export interface DesktopConnectorFormValue {
  args: string
  bearerToken: string
  command: string
  cwd: string
  env: string
  headers: string
  id: string
  name: string
  transport: 'stdio' | 'streamable-http'
  url: string
}

export interface DesktopConnectorSavePlan {
  config: LocalConnectorConfig
  credential: LocalConnectorCredentialMutation
}

export function createConnectorSavePlan(
  form: DesktopConnectorFormValue,
  existing?: LocalConnector | null,
): DesktopConnectorSavePlan {
  const id = form.id.trim()
  const name = form.name.trim()

  if (form.transport === 'stdio') {
    const args = splitLines(form.args)
    const command = form.command.trim()
    const cwd = form.cwd.trim() || null
    const config: LocalConnectorConfig = {
      args,
      command,
      cwd,
      enabled: preservesEnabledStdioTarget(existing, command, args, cwd),
      id,
      name,
      transport: 'stdio',
    }
    const env = parseEntries(form.env, ENVIRONMENT_KEY_PATTERN)

    return { config, credential: resolveCredentialMutation(
      Object.keys(env).length > 0 ? { env, type: 'stdio' } : null,
      existing,
      sameConnectorTarget(existing, config),
    ) }
  }

  const bearerToken = form.bearerToken.trim()
  const headers = parseEntries(form.headers, HTTP_HEADER_NAME_PATTERN)
  const credential: LocalConnectorCredential | null
    = bearerToken || Object.keys(headers).length > 0
      ? {
          ...(bearerToken ? { bearerToken } : {}),
          ...(Object.keys(headers).length > 0 ? { headers } : {}),
          type: 'http',
        }
      : null

  const config: LocalConnectorConfig = {
    enabled: existing?.transport === 'streamable-http' ? existing.enabled : true,
    id,
    name,
    transport: 'streamable-http',
    url: form.url.trim(),
  }
  return {
    config,
    credential: resolveCredentialMutation(
      credential,
      existing,
      sameConnectorTarget(existing, config),
    ),
  }
}

function resolveCredentialMutation(
  credential: LocalConnectorCredential | null,
  existing: LocalConnector | null | undefined,
  sameTarget: boolean,
): LocalConnectorCredentialMutation {
  if (credential)
    return { mode: 'replace', value: credential }
  if (existing?.credentialConfigured && sameTarget)
    return { mode: 'keep' }
  return { mode: 'clear' }
}

function sameConnectorTarget(
  existing: LocalConnector | null | undefined,
  config: LocalConnectorConfig,
): boolean {
  if (!existing || existing.transport !== config.transport)
    return false
  if (config.transport === 'streamable-http')
    return existing.transport === 'streamable-http' && existing.url === config.url
  if (existing.transport !== 'stdio')
    return false
  return existing.command === config.command
    && existing.cwd === config.cwd
    && arraysEqual(existing.args, config.args)
}

function preservesEnabledStdioTarget(
  existing: LocalConnector | null | undefined,
  command: string,
  args: string[],
  cwd: string | null,
): boolean {
  return existing?.transport === 'stdio'
    && existing.enabled
    && existing.trusted
    && existing.command === command
    && existing.cwd === cwd
    && arraysEqual(existing.args, args)
}

function splitLines(value: string): string[] {
  return value.split('\n').map(line => line.trim()).filter(Boolean)
}

function parseEntries(value: string, keyPattern?: RegExp): Record<string, string> {
  return Object.fromEntries(value.split(/\r?\n/).filter(line => line.trim()).map((line) => {
    const separator = line.indexOf('=')
    const key = line.slice(0, separator).trim()
    if (separator < 1 || !key || (keyPattern && !keyPattern.test(key)))
      throw new Error('INVALID_KEY_VALUE_ENTRY')
    return [key, line.slice(separator + 1)]
  }))
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}
