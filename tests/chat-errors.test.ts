import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { chatErrorLabel } from '@/lib/recruiting-rag/chat-errors'

const GENERIC_LABEL = 'Jane chưa trả lời được. Kiểm tra API key hoặc server logs rồi thử lại nhé.'

describe('chatErrorLabel', () => {
  it('surfaces the server message when the user hits the daily rate limit (429)', () => {
    const error = new Error('{"error":"Bạn đã đạt giới hạn chat hôm nay."}')
    assert.equal(chatErrorLabel(error), 'Bạn đã đạt giới hạn chat hôm nay.')
  })

  it('surfaces the server message when the session expired (401)', () => {
    const error = new Error('{"error":"Bạn cần đăng nhập lại trước khi chat với Jane."}')
    assert.equal(chatErrorLabel(error), 'Bạn cần đăng nhập lại trước khi chat với Jane.')
  })

  it('surfaces the server message when an API key is missing (503)', () => {
    const error = new Error('{"error":"Thiếu ANTHROPIC_API_KEY nên Jane chưa thể trả lời."}')
    assert.equal(chatErrorLabel(error), 'Thiếu ANTHROPIC_API_KEY nên Jane chưa thể trả lời.')
  })

  it('falls back to the OpenAI key hint for non-JSON messages naming the key', () => {
    const error = new Error('LoadAPIKeyError: OPENAI_API_KEY is missing')
    assert.equal(chatErrorLabel(error), 'Jane chưa trả lời được vì thiếu OPENAI_API_KEY trên server.')
  })

  it('falls back to the Anthropic key hint for non-JSON messages naming the key', () => {
    const error = new Error('LoadAPIKeyError: ANTHROPIC_API_KEY is missing')
    assert.equal(chatErrorLabel(error), 'Jane chưa trả lời được vì thiếu ANTHROPIC_API_KEY trên server.')
  })

  it('returns the generic label when there is no error', () => {
    assert.equal(chatErrorLabel(undefined), GENERIC_LABEL)
  })

  it('returns the generic label for non-JSON network errors', () => {
    assert.equal(chatErrorLabel(new Error('Failed to fetch')), GENERIC_LABEL)
  })

  it('returns the generic label when the JSON body has no usable error field', () => {
    assert.equal(chatErrorLabel(new Error('{"error":""}')), GENERIC_LABEL)
    assert.equal(chatErrorLabel(new Error('{"detail":"boom"}')), GENERIC_LABEL)
  })
})
