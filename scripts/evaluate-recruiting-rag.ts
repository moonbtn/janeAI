import {
  evaluateRetrievalCases,
  loadDefaultApprovedChunks,
  retrievalEvalCases,
} from '@/lib/recruiting-rag/evaluation'

const chunks = loadDefaultApprovedChunks()
const results = evaluateRetrievalCases({ chunks, cases: retrievalEvalCases, topK: 3 })
const failed = results.filter((result) => !result.passed)

for (const result of results) {
  console.log(
    JSON.stringify({
      id: result.id,
      passed: result.passed,
      expectedTopics: result.expectedTopics,
      topResults: result.topResults,
    })
  )
}

if (failed.length > 0) {
  console.error(`RAG retrieval evaluation failed for ${failed.length} case(s).`)
  process.exit(1)
}

console.log(`RAG retrieval evaluation passed for ${results.length} case(s).`)
