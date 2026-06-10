import type { ApprovedChunk } from './approved-chunks'

export const DEFAULT_RAG_MIN_SCORE = 0.2
export const DEFAULT_RETRIEVED_TEXT_MAX_CHARS = 1200

export type ChatTextMessage = {
  role: 'user' | 'assistant' | string
  content?: string
  parts?: Array<{ type?: string; text?: string }>
}

export type RetrievalResult = {
  chunkId: string
  text: string
  topic: string
  sourceLabel: string
  score: number
}

export type RetrievedSourceMetadata = {
  chunkId: string
  topic: string
  sourceLabel: string
  score: number
}

function textFromMessage(message: ChatTextMessage): string {
  if (typeof message.content === 'string') return message.content.trim()
  return (
    message.parts
      ?.filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n')
      .trim() ?? ''
  )
}

export function buildRetrievalQuery(messages: ChatTextMessage[]): string {
  const latestUser = messages.filter((message) => message.role === 'user').at(-1)
  return latestUser ? textFromMessage(latestUser) : ''
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'can',
  'do',
  'does',
  'for',
  'how',
  'i',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'so',
  'the',
  'then',
  'to',
  'what',
  'when',
  'where',
  'with',
  'you',
  'anh',
  'bi',
  'cai',
  'can',
  'chi',
  'cho',
  'con',
  'cua',
  'duoc',
  'em',
  'gi',
  'la',
  'lam',
  'minh',
  'mot',
  'nay',
  'nen',
  'neu',
  'nhu',
  'sao',
  'thi',
  'toi',
  'trong',
  've',
  'voi',
])

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token))
}

const tokenCache = new WeakMap<ApprovedChunk, Set<string>>()

function chunkTokenSet(chunk: ApprovedChunk): Set<string> {
  const cached = tokenCache.get(chunk)
  if (cached) return cached

  const retrievalText = [chunk.embeddingText ?? chunk.text, chunk.topic].join('\n')
  const tokens = new Set(tokenize(retrievalText))
  tokenCache.set(chunk, tokens)
  return tokens
}

function scoreChunk(queryTokens: Set<string>, chunk: ApprovedChunk): number {
  if (queryTokens.size === 0) return 0

  const chunkTokens = chunkTokenSet(chunk)
  let matches = 0

  for (const token of queryTokens) {
    if (chunkTokens.has(token)) matches += 1
  }

  const profileBoost = queryTokens.has('jane') && chunk.topic === 'jane_profile' ? 2 : 0
  return matches / queryTokens.size + profileBoost
}

function truncateRetrievedText(text: string, maxChars = DEFAULT_RETRIEVED_TEXT_MAX_CHARS): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars).trimEnd()}\n[truncated]`
}

export function retrieveRelevantChunks(
  query: string,
  chunks: ApprovedChunk[],
  topK = 6
): RetrievalResult[] {
  const queryTokens = new Set(tokenize(query))

  return chunks
    .map((chunk) => ({
      chunkId: chunk.id,
      text: chunk.text,
      topic: chunk.topic,
      sourceLabel: chunk.sourceLabel,
      score: scoreChunk(queryTokens, chunk),
    }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId))
    .slice(0, topK)
}

export function formatRetrievedContext(results: RetrievalResult[]): string {
  return results
    .map((result, index) =>
      [
        `[Source ${index + 1}]`,
        `Topic: ${result.topic}`,
        `Source: ${result.sourceLabel}`,
        `Score: ${result.score.toFixed(3)}`,
        `Text: ${truncateRetrievedText(result.text)}`,
      ].join('\n')
    )
    .join('\n\n')
}

export function filterUsableRetrievalResults(
  results: RetrievalResult[],
  minScore = DEFAULT_RAG_MIN_SCORE
): RetrievalResult[] {
  return results.filter((result) => result.score >= minScore)
}

export function retrievedSourceMetadata(
  results: RetrievalResult[],
  minScore = DEFAULT_RAG_MIN_SCORE
): RetrievedSourceMetadata[] {
  return filterUsableRetrievalResults(results, minScore).map((result) => ({
    chunkId: result.chunkId,
    topic: result.topic,
    sourceLabel: result.sourceLabel,
    score: result.score,
  }))
}

export function prepareRagForChat(results: RetrievalResult[], minScore = DEFAULT_RAG_MIN_SCORE) {
  const usableResults = filterUsableRetrievalResults(results, minScore)
  const retrievedSources = retrievedSourceMetadata(usableResults, minScore)

  return {
    hasStrongContext: usableResults.length > 0,
    retrievedContext: formatRetrievedContext(usableResults),
    usedChunkIds: usableResults.map((result) => result.chunkId),
    retrievedSources,
  }
}
