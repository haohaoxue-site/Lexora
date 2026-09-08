import type { LocalConnector } from '@buddy-shared/connectors/connectorApi'

import { describe, expect, it } from 'vitest'

import { createConnectorSavePlan } from '../desktopConnectorForm'

describe('createConnectorSavePlan', () => {
  it('persists a new stdio connector disabled with named environment credentials', () => {
    const plan = createConnectorSavePlan({
      args: 'server.mjs\n--stdio',
      bearerToken: '',
      command: 'node',
      cwd: '/workspace',
      env: 'GITHUB_PERSONAL_ACCESS_TOKEN=redacted\nCUSTOM_TOKEN= value=with=equals ',
      headers: '',
      id: 'github',
      name: 'GitHub',
      transport: 'stdio',
      url: '',
    })

    expect(plan).toEqual({
      config: {
        args: ['server.mjs', '--stdio'],
        command: 'node',
        cwd: '/workspace',
        enabled: false,
        id: 'github',
        name: 'GitHub',
        transport: 'stdio',
      },
      credential: {
        mode: 'replace',
        value: {
          env: {
            CUSTOM_TOKEN: ' value=with=equals ',
            GITHUB_PERSONAL_ACCESS_TOKEN: 'redacted',
          },
          type: 'stdio',
        },
      },
    })
  })

  it('preserves enabled only while the trusted stdio execution target is unchanged', () => {
    const connector: LocalConnector = {
      args: ['server.mjs'],
      command: 'node',
      credentialConfigured: true,
      cwd: '/workspace',
      enabled: true,
      id: 'local',
      name: 'Local',
      transport: 'stdio',
      trusted: true,
    }
    const base = {
      args: 'server.mjs',
      bearerToken: '',
      command: 'node',
      cwd: '/workspace',
      env: '',
      headers: '',
      id: 'local',
      name: 'Local',
      transport: 'stdio' as const,
      url: '',
    }

    expect(createConnectorSavePlan(base, connector).config.enabled).toBe(true)
    expect(createConnectorSavePlan({ ...base, command: 'bun' }, connector).config.enabled)
      .toBe(false)
  })

  it('keeps HTTP bearer and header credentials as separate protocol fields', () => {
    const plan = createConnectorSavePlan({
      args: '',
      bearerToken: 'redacted-bearer',
      command: '',
      cwd: '',
      env: '',
      headers: 'X-API-Key=redacted-key\nX-Tenant=personal',
      id: 'remote',
      name: 'Remote',
      transport: 'streamable-http',
      url: 'https://mcp.example.com',
    })

    expect(plan.credential).toEqual({
      mode: 'replace',
      value: {
        bearerToken: 'redacted-bearer',
        headers: {
          'X-API-Key': 'redacted-key',
          'X-Tenant': 'personal',
        },
        type: 'http',
      },
    })
  })

  it('keeps blank credentials only while the connector target is unchanged', () => {
    const connector: LocalConnector = {
      credentialConfigured: true,
      enabled: true,
      id: 'remote',
      name: 'Remote',
      transport: 'streamable-http',
      trusted: true,
      url: 'https://first.example.com/mcp',
    }
    const form = {
      args: '',
      bearerToken: '',
      command: '',
      cwd: '',
      env: '',
      headers: '',
      id: 'remote',
      name: 'Remote',
      transport: 'streamable-http' as const,
      url: connector.url,
    }

    expect(createConnectorSavePlan(form, connector).credential).toEqual({ mode: 'keep' })
    expect(createConnectorSavePlan({
      ...form,
      url: 'https://second.example.com/mcp',
    }, connector).credential).toEqual({ mode: 'clear' })
  })

  it('rejects credential names that the runtime protocol cannot accept', () => {
    expect(() => createConnectorSavePlan({
      args: '',
      bearerToken: '',
      command: '',
      cwd: '',
      env: '',
      headers: 'Invalid Header=value',
      id: 'remote',
      name: 'Remote',
      transport: 'streamable-http',
      url: 'https://mcp.example.com',
    })).toThrow('INVALID_KEY_VALUE_ENTRY')
  })
})
