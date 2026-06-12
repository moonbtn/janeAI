import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { ModelMessage } from 'ai'

import {
  addCacheBreakpointToLastAssistantMessage,
  appendContextToLatestUserMessage,
} from '@/lib/recruiting-rag/chat-messages'

const CONTEXT_BLOCK = '<approved_retrieved_context>\nGuidance\n</approved_retrieved_context>'

describe('appendContextToLatestUserMessage', () => {
  it('appends the context block to string content of the latest user message', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Tuyển Data Scientist thế nào?' },
    ]

    const result = appendContextToLatestUserMessage(messages, CONTEXT_BLOCK)

    assert.equal(result[0].content, `Tuyển Data Scientist thế nào?\n\n${CONTEXT_BLOCK}`)
  })

  it('appends a text part when the latest user message has array content', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: [{ type: 'text', text: 'Câu hỏi' }] },
    ]

    const result = appendContextToLatestUserMessage(messages, CONTEXT_BLOCK)
    const content = result[0].content

    assert.ok(Array.isArray(content))
    assert.equal(content.length, 2)
    assert.deepEqual(content[1], { type: 'text', text: CONTEXT_BLOCK })
  })

  it('targets only the LATEST user message and leaves history untouched', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Câu hỏi 1' },
      { role: 'assistant', content: 'Trả lời 1' },
      { role: 'user', content: 'Câu hỏi 2' },
    ]

    const result = appendContextToLatestUserMessage(messages, CONTEXT_BLOCK)

    assert.equal(result[0].content, 'Câu hỏi 1')
    assert.equal(result[1].content, 'Trả lời 1')
    assert.equal(result[2].content, `Câu hỏi 2\n\n${CONTEXT_BLOCK}`)
  })

  it('does not mutate the input messages', () => {
    const messages: ModelMessage[] = [{ role: 'user', content: 'Câu hỏi' }]

    appendContextToLatestUserMessage(messages, CONTEXT_BLOCK)

    assert.equal(messages[0].content, 'Câu hỏi')
  })

  it('returns messages unchanged when there is no user message', () => {
    const messages: ModelMessage[] = [{ role: 'assistant', content: 'Hello' }]

    const result = appendContextToLatestUserMessage(messages, CONTEXT_BLOCK)

    assert.deepEqual(result, messages)
  })
})

describe('addCacheBreakpointToLastAssistantMessage', () => {
  it('adds the anthropic cacheControl provider option to the last assistant message only', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Câu hỏi 1' },
      { role: 'assistant', content: 'Trả lời 1' },
      { role: 'user', content: 'Câu hỏi 2' },
      { role: 'assistant', content: 'Trả lời 2' },
      { role: 'user', content: 'Câu hỏi 3' },
    ]

    const result = addCacheBreakpointToLastAssistantMessage(messages)

    assert.equal(result[1].providerOptions, undefined)
    assert.deepEqual(result[3].providerOptions, {
      anthropic: { cacheControl: { type: 'ephemeral' } },
    })
    assert.equal(result[4].providerOptions, undefined)
  })

  it('preserves existing providerOptions keys on the message', () => {
    const messages: ModelMessage[] = [
      {
        role: 'assistant',
        content: 'Trả lời',
        providerOptions: { other: { keep: true } },
      },
    ]

    const result = addCacheBreakpointToLastAssistantMessage(messages)

    assert.deepEqual(result[0].providerOptions, {
      other: { keep: true },
      anthropic: { cacheControl: { type: 'ephemeral' } },
    })
  })

  it('returns messages unchanged when there is no assistant message (first turn)', () => {
    const messages: ModelMessage[] = [{ role: 'user', content: 'Câu hỏi' }]

    const result = addCacheBreakpointToLastAssistantMessage(messages)

    assert.deepEqual(result, messages)
  })

  it('does not mutate the input messages', () => {
    const messages: ModelMessage[] = [{ role: 'assistant', content: 'Trả lời' }]

    addCacheBreakpointToLastAssistantMessage(messages)

    assert.equal(messages[0].providerOptions, undefined)
  })
})
