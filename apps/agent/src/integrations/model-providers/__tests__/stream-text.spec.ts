import type { AgentModelStreamPart } from '../stream-text'
import { AIMessageChunk } from '@langchain/core/messages'
import { describe, expect, it } from 'vitest'
import { consumeChatModelTextStream } from '../stream-text'

describe('consumeChatModelTextStream tool call chunks', () => {
  it('buffers tool call deltas until the provider sends a stable tool call id', async () => {
    const parts: AgentModelStreamPart[] = []

    await consumeChatModelTextStream(createStream([
      new AIMessageChunk({
        content: '',
        tool_call_chunks: [{
          index: 0,
          name: 'save_memory',
          args: '{"content"',
        }],
      }),
      new AIMessageChunk({
        content: '',
        tool_call_chunks: [{
          index: 0,
          id: 'call-1',
          args: ':"done"}',
        }],
      }),
    ]), {
      onStreamPart: part => parts.push(part),
    })

    expect(parts.some(part => 'toolCallId' in part && part.toolCallId === 'index:0')).toBe(false)
    expect(parts.filter(part => part.type === 'tool.call.started').map(part => part.toolCallId)).toEqual(['call-1'])
    expect(parts.filter(part => part.type === 'tool.call.args.delta').map(part => ({
      toolCallId: part.toolCallId,
      text: part.text,
    }))).toEqual([
      {
        toolCallId: 'call-1',
        text: '{"content"',
      },
      {
        toolCallId: 'call-1',
        text: ':"done"}',
      },
    ])
    expect(parts.filter(part => part.type === 'tool.call.completed').map(part => part.toolCallId)).toEqual(['call-1'])
  })
})

async function* createStream(chunks: AIMessageChunk[]): AsyncIterable<AIMessageChunk> {
  for (const chunk of chunks) {
    yield chunk
  }
}
