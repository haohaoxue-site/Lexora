import type { ApplicationDiagnostic } from '../../../../shared/diagnostics/applicationDiagnostic'
import { describe, expect, it } from 'vitest'
import { applicationDiagnosticSchema } from '../../../../shared/diagnostics/applicationDiagnostic'
import { PiApplicationObserver } from '../PiApplicationObserver'

describe('pi application metadata', () => {
  it('correlates compound SDK tool identities without copying encoded or private payloads', () => {
    const records: ApplicationDiagnostic[] = []
    const observer = new PiApplicationObserver({ runId: 'run-1', report: event => records.push(event) })
    const toolCallId = `call-1|${'encoded-private-value/+'.repeat(30)}=`
    observer.handle({ type: 'turn_start' })
    observer.handle({ type: 'tool_execution_start', toolCallId, toolName: 'read', args: { path: 'private-path' } })
    observer.authorized(toolCallId)
    observer.handle({ type: 'tool_execution_end', toolCallId, toolName: 'read', result: 'private-result', isError: false })
    const toolEvents = records.filter(record => record.event.startsWith('tool.'))
    expect(toolEvents.map(record => record.event)).toEqual(['tool.requested', 'tool.authorized', 'tool.completed'])
    expect(new Set(toolEvents.map(record => record.toolCallId)).size).toBe(1)
    expect(toolEvents[0]?.toolCallId).toMatch(/^pi:[\da-f]{64}$/)
    expect(toolEvents.every(record => record.turnId === 'run-1:1')).toBe(true)
    expect(records.every(record => applicationDiagnosticSchema.safeParse(record).success)).toBe(true)
    expect(JSON.stringify(records)).not.toContain('private')
  })
})
