export const APPROVED_RISK_LEVEL = 'approved_public'

export type ApprovedChunkMetadata = Record<string, unknown>

export type ApprovedChunk = {
  id: string
  text: string
  embeddingText?: string
  topic: string
  sourceLabel: string
  riskLevel: typeof APPROVED_RISK_LEVEL
  metadata: ApprovedChunkMetadata
}

type RawApprovedChunk = {
  id?: unknown
  text?: unknown
  embedding_text?: unknown
  topic?: unknown
  source_label?: unknown
  risk_level?: unknown
  metadata?: unknown
}

function requiredString(value: unknown, field: string, lineNumber: number): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Line ${lineNumber}: missing required field ${field}`)
  }
  return value.trim()
}

function containsPrivateSourceMarker(value: unknown): boolean {
  const serialized = JSON.stringify(value)
  return /\/Users\/|GoogleDrive|CloudStorage|private notes?|internal_only/i.test(serialized)
}

export function parseApprovedChunkLine(line: string, lineNumber: number): ApprovedChunk {
  let raw: RawApprovedChunk

  try {
    raw = JSON.parse(line) as RawApprovedChunk
  } catch (error) {
    throw new Error(`Line ${lineNumber}: invalid JSON`, { cause: error })
  }

  if (raw.risk_level !== APPROVED_RISK_LEVEL) {
    throw new Error(`Line ${lineNumber}: expected risk_level approved_public`)
  }

  if (containsPrivateSourceMarker(raw)) {
    throw new Error(`Line ${lineNumber}: private source marker found`)
  }

  const metadata =
    raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
      ? (raw.metadata as ApprovedChunkMetadata)
      : {}
  const embeddingText =
    typeof raw.embedding_text === 'string' && raw.embedding_text.trim().length > 0
      ? raw.embedding_text.trim()
      : undefined

  return {
    id: requiredString(raw.id, 'id', lineNumber),
    text: requiredString(raw.text, 'text', lineNumber),
    ...(embeddingText ? { embeddingText } : {}),
    topic: requiredString(raw.topic, 'topic', lineNumber),
    sourceLabel: requiredString(raw.source_label, 'source_label', lineNumber),
    riskLevel: APPROVED_RISK_LEVEL,
    metadata,
  }
}

export function loadApprovedChunksFromText(jsonl: string): ApprovedChunk[] {
  const chunks: ApprovedChunk[] = []
  const seen = new Set<string>()

  for (const [index, line] of jsonl.split(/\r?\n/).entries()) {
    if (!line.trim()) continue
    const chunk = parseApprovedChunkLine(line, index + 1)
    if (seen.has(chunk.id)) continue
    seen.add(chunk.id)
    chunks.push(chunk)
  }

  return chunks
}
