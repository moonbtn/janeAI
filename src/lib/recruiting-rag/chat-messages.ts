import type { ModelMessage } from 'ai'

export function appendContextToLatestUserMessage(
  messages: ModelMessage[],
  contextBlock: string
): ModelMessage[] {
  const result = [...messages]
  for (let i = result.length - 1; i >= 0; i--) {
    const message = result[i]
    if (message.role !== 'user') continue
    result[i] = {
      ...message,
      content:
        typeof message.content === 'string'
          ? `${message.content}\n\n${contextBlock}`
          : [...message.content, { type: 'text', text: contextBlock }],
    }
    return result
  }
  return result
}

export function addCacheBreakpointToLastAssistantMessage(
  messages: ModelMessage[]
): ModelMessage[] {
  const result = [...messages]
  for (let i = result.length - 1; i >= 0; i--) {
    const message = result[i]
    if (message.role !== 'assistant') continue
    result[i] = {
      ...message,
      providerOptions: {
        ...message.providerOptions,
        anthropic: { cacheControl: { type: 'ephemeral' } },
      },
    }
    return result
  }
  return result
}
