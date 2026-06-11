// useChat surfaces failed responses as Error(message = raw response body text),
// so the HTTP status is never available here — only the body. Routes return
// user-facing Vietnamese messages as {"error": "..."}; surface those directly.
export function chatErrorLabel(error: Error | undefined): string {
  const message = error?.message ?? ''

  try {
    const parsed = JSON.parse(message) as { error?: unknown }
    if (typeof parsed.error === 'string' && parsed.error.trim()) {
      return parsed.error
    }
  } catch {
    // Not a JSON body (network failure, masked stream error) — use heuristics below.
  }

  if (message.includes('OPENAI_API_KEY')) {
    return 'Jane chưa trả lời được vì thiếu OPENAI_API_KEY trên server.'
  }
  if (message.includes('ANTHROPIC_API_KEY')) {
    return 'Jane chưa trả lời được vì thiếu ANTHROPIC_API_KEY trên server.'
  }
  return 'Jane chưa trả lời được. Kiểm tra API key hoặc server logs rồi thử lại nhé.'
}
