import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { loadApprovedChunksFromText, type ApprovedChunk } from './approved-chunks'
import { retrieveRelevantChunks } from './retrieval'

const DEFAULT_FIXTURE_PATH = join(
  process.cwd(),
  'src/lib/recruiting-rag/corpus/approved-kb-chunks-with-cards.jsonl'
)
const DEFAULT_PROFILE_FACTS_PATH = join(
  process.cwd(),
  'src/lib/recruiting-rag/corpus/jane-profile-facts.jsonl'
)
let defaultApprovedChunksCache: ApprovedChunk[] | null = null

export type RetrievalEvalCase = {
  id: string
  question: string
  expectedTopics: string[]
  expectedChunkIds?: string[]
}

export type RetrievalEvalResult = RetrievalEvalCase & {
  passed: boolean
  matchedTopics: string[]
  topResults: Array<{
    chunkId: string
    topic: string
    score: number
  }>
}

export const retrievalEvalCases: RetrievalEvalCase[] = [
  {
    id: 'sourcing-senior-vs-junior',
    question: 'Tôi nên dùng LinkedIn hay Facebook để tuyển senior backend engineer?',
    expectedTopics: ['sourcing_strategy'],
  },
  {
    id: 'candidate-persona',
    question: 'Làm sao xây candidate persona cho vị trí Data Scientist?',
    expectedTopics: ['candidate_persona'],
  },
  {
    id: 'interview-process',
    question: 'Quy trình interview nên có mấy vòng và đánh giá thế nào?',
    expectedTopics: ['interview_process'],
  },
  {
    id: 'offer-risk',
    question: 'Ứng viên lăn tăn offer, ngoài lương mình nên xử lý gì?',
    expectedTopics: ['offer_risk'],
  },
  {
    id: 'job-posting',
    question: 'JD của tôi quá mơ hồ, nên viết must-have và CTA như thế nào?',
    expectedTopics: ['job_posting'],
  },
]

export function loadDefaultApprovedChunks(path = DEFAULT_FIXTURE_PATH): ApprovedChunk[] {
  if (path === DEFAULT_FIXTURE_PATH && defaultApprovedChunksCache) {
    return defaultApprovedChunksCache
  }

  const chunks = loadApprovedChunksFromText(readFileSync(path, 'utf8'))
  if (path === DEFAULT_FIXTURE_PATH) {
    chunks.push(...loadApprovedChunksFromText(readFileSync(DEFAULT_PROFILE_FACTS_PATH, 'utf8')))
  }

  if (path === DEFAULT_FIXTURE_PATH) {
    defaultApprovedChunksCache = chunks
  }

  return chunks
}

export function evaluateRetrievalCases({
  chunks,
  cases,
  topK = 3,
}: {
  chunks: ApprovedChunk[]
  cases: RetrievalEvalCase[]
  topK?: number
}): RetrievalEvalResult[] {
  return cases.map((evalCase) => {
    const topResults = retrieveRelevantChunks(evalCase.question, chunks, topK)
    const matchedTopics = topResults.map((result) => result.topic)
    const matchedChunkIds = topResults.map((result) => result.chunkId)
    const topicPassed = evalCase.expectedTopics.some((topic) => matchedTopics.includes(topic))
    const chunkPassed =
      !evalCase.expectedChunkIds ||
      evalCase.expectedChunkIds.some((chunkId) => matchedChunkIds.includes(chunkId))

    return {
      ...evalCase,
      passed: topicPassed && chunkPassed,
      matchedTopics,
      topResults: topResults.map((result) => ({
        chunkId: result.chunkId,
        topic: result.topic,
        score: Number(result.score.toFixed(3)),
      })),
    }
  })
}
