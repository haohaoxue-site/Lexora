import { spawn } from 'node:child_process'
import process from 'node:process'
import { describe, expect, it, vi } from 'vitest'

import {
  LinuxSystemHost,
} from '../LinuxSystemHost'

describe('linuxSystemHost', () => {
  it('keeps the escaped systemd unit identity separate from its display value', async () => {
    const rawUnit = 'app-fixture\\x2dclient@autostart.service'
    const displayUnit = 'app-fixture-client@autostart.service'
    const runCommand = vi.fn(async (_executable: string, args: readonly string[]) => {
      if (args.includes('list-units')) {
        return {
          exitCode: 0,
          stdout: `${rawUnit} loaded active running Fixture Client\n`,
        }
      }
      if (args.includes('show')) {
        return {
          exitCode: 0,
          stdout: [
            `Id=${rawUnit}`,
            'LoadState=loaded',
            'ActiveState=active',
            'SubState=running',
            'MainPID=4242',
          ].join('\n'),
        }
      }
      return { exitCode: 0, stdout: '' }
    })
    const host = new LinuxSystemHost({ runCommand })

    const [target] = await host.resolveTargets({
      kind: 'service',
      scope: 'user',
      serviceId: displayUnit,
    }, new AbortController().signal)

    expect(target).toMatchObject({
      displayId: displayUnit,
      scope: 'user',
      serviceId: rawUnit,
    })
    if (!target || target.kind !== 'service')
      throw new Error('mutable user service was not resolved')

    await expect(host.readTarget(
      target,
      new AbortController().signal,
    )).resolves.toMatchObject({ serviceId: rawUnit })
    await host.execute(
      target,
      'restart-service',
      new AbortController().signal,
    )

    expect(runCommand).toHaveBeenCalledWith(
      '/usr/bin/systemctl',
      expect.arrayContaining(['show', rawUnit]),
      expect.any(AbortSignal),
    )
    expect(runCommand).toHaveBeenCalledWith(
      '/usr/bin/systemctl',
      ['--user', 'restart', '--', rawUnit],
      expect.any(AbortSignal),
    )
    expect(runCommand.mock.calls.filter(([, args]) => args.includes('list-units'))).toHaveLength(1)
  })

  it('resolves an exact installed user service even when it is not loaded yet', async () => {
    const runCommand = vi.fn(async (_executable: string, args: readonly string[]) => {
      if (args.includes('list-units'))
        return { exitCode: 0, stdout: '' }
      return {
        exitCode: 0,
        stdout: [
          'Id=example-worker.service',
          'LoadState=loaded',
          'ActiveState=inactive',
          'Description=Example worker',
        ].join('\n'),
      }
    })
    const host = new LinuxSystemHost({ runCommand })

    await expect(host.resolveTargets({
      kind: 'service',
      scope: 'user',
      serviceId: 'example-worker.service',
    }, new AbortController().signal)).resolves.toEqual([expect.objectContaining({
      activeState: 'inactive',
      displayName: 'Example worker',
      serviceId: 'example-worker.service',
    })])
  })

  it('propagates cancellation while resolving a target', async () => {
    const controller = new AbortController()
    const reason = new Error('run cancelled')
    const host = new LinuxSystemHost({
      runCommand: vi.fn().mockImplementation(async () => {
        controller.abort(reason)
        throw reason
      }),
    })

    await expect(host.resolveTargets({
      kind: 'service',
      scope: 'user',
      serviceId: 'fixture.service',
    }, controller.signal)).rejects.toBe(reason)
  })

  it.runIf(process.platform === 'linux')(
    'resolves and gracefully terminates only an exact disposable pid',
    async () => {
      const child = spawn('/usr/bin/sleep', ['30'], { stdio: 'ignore' })
      const pid = child.pid
      if (!pid)
        throw new Error('disposable process did not start')
      const close = new Promise<void>(resolve => child.once('close', () => resolve()))
      try {
        const host = new LinuxSystemHost()
        const targets = await host.resolveTargets({
          kind: 'process',
          pid,
        }, new AbortController().signal)
        expect(targets).toHaveLength(1)
        const target = targets[0]
        expect(target).toMatchObject({
          allowedActions: expect.arrayContaining(['terminate-process']),
          pid,
        })
        if (!target)
          throw new Error('disposable process was not resolved')

        await host.execute(target, 'terminate-process', new AbortController().signal)
        await close

        await expect(host.readTarget(target, new AbortController().signal)).resolves.toBeNull()
      }
      finally {
        if (child.exitCode === null)
          child.kill('SIGKILL')
        await close
      }
    },
  )
})
