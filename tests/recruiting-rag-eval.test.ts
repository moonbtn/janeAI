import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  evaluateRetrievalCases,
  loadDefaultApprovedChunks,
  retrievalEvalCases,
} from '@/lib/recruiting-rag/evaluation'

describe('offline recruiting RAG evaluation', () => {
  it('loads the committed approved-public corpus with retrieval cards', () => {
    const chunks = loadDefaultApprovedChunks()

    assert.ok(chunks.length >= 500)
    assert.ok(chunks.every((chunk) => chunk.riskLevel === 'approved_public'))
    assert.ok(chunks.some((chunk) => chunk.embeddingText?.includes('candidate persona')))
    assert.ok(chunks.some((chunk) => chunk.id === 'source__jane_profile_facts__000__b7f4c3e2a1'))
  })

  it('reuses the committed corpus after the first load', () => {
    assert.equal(loadDefaultApprovedChunks(), loadDefaultApprovedChunks())
  })

  it('passes the required golden retrieval cases', () => {
    const results = evaluateRetrievalCases({
      chunks: loadDefaultApprovedChunks(),
      cases: retrievalEvalCases,
      topK: 3,
    })

    assert.equal(results.every((result) => result.passed), true)
  })

  it('retrieves Jane profile facts for personal Jane questions', () => {
    const chunks = loadDefaultApprovedChunks()

    const [education] = evaluateRetrievalCases({
      chunks,
      cases: [
        {
          id: 'jane-education',
          question: 'Jane học ở đâu?',
          expectedTopics: ['jane_profile'],
        },
      ],
      topK: 3,
    })

    const [favoriteFood] = evaluateRetrievalCases({
      chunks,
      cases: [
        {
          id: 'jane-favorite-food',
          question: 'Jane thích ăn gì?',
          expectedTopics: ['jane_profile'],
        },
      ],
      topK: 3,
    })

    assert.equal(education.passed, true)
    assert.equal(favoriteFood.passed, true)
  })
})
