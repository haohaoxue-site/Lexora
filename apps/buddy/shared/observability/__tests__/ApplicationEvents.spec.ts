import type { ApplicationDiagnostic, ApplicationDiagnosticReporter } from '../../diagnostics/applicationDiagnostic'
import { describe, expect, it } from 'vitest'
import { ApplicationEvents } from '../ApplicationEvents'

describe('application observation channel', () => {
  it('keeps void reporters that return an incidental value subscribed', async () => {
    const records: ApplicationDiagnostic[] = []
    const reporter: ApplicationDiagnosticReporter = event => records.push(event)
    const events = new ApplicationEvents({ component: 'runtime.test' })
    events.subscribe(reporter)
    await events.operation('session.open', async (scoped) => {
      await scoped.operation('session.resources', () => true)
    })
    expect(records.map(record => record.event)).toEqual([
      'session.open.started',
      'session.resources.started',
      'session.resources.completed',
      'session.open.completed',
    ])
    expect(records.map(record => record.sourceSequence)).toEqual([1, 2, 3, 4])
    expect(records[1]?.parentOperationId).toBe(records[0]?.operationId)
    expect(records[0]?.operationId).toBe(records[3]?.operationId)
  })

  it('isolates rejecting observers without exposing their errors or changing the operation result', async () => {
    const events = new ApplicationEvents()
    const records: ApplicationDiagnostic[] = []
    events.subscribe((event) => {
      records.push(event)
    })
    events.subscribe(async () => {
      throw new Error('private sink detail')
    })
    await expect(events.operation('session.open', () => 42)).resolves.toBe(42)
    expect(records.filter(record => record.event === 'observer.failed')).toHaveLength(1)
    expect(records.at(-1)?.event).toBe('session.open.completed')
    expect(JSON.stringify(records)).not.toContain('private')
  })
})
