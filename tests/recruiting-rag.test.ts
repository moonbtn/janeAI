import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  APPROVED_RISK_LEVEL,
  loadApprovedChunksFromText,
  parseApprovedChunkLine,
} from '@/lib/recruiting-rag/approved-chunks'
import {
  DEFAULT_RAG_MIN_SCORE,
  buildRetrievalQuery,
  formatRetrievedContext,
  prepareRagForChat,
  retrieveRelevantChunks,
} from '@/lib/recruiting-rag/retrieval'
import {
  buildRecruitingContextBlock,
  buildRecruitingSystemPrompt,
} from '@/lib/recruiting-rag/prompt'

describe('approved recruiting chunks', () => {
  it('parses approved chunks and preserves embedding text for retrieval', () => {
    const chunk = parseApprovedChunkLine(
      JSON.stringify({
        id: 'chunk-1',
        text: 'Raw approved text',
        embedding_text: 'Retrieval card text',
        topic: 'candidate_persona',
        source_label: 'JaneAI recruiting training corpus',
        risk_level: APPROVED_RISK_LEVEL,
        metadata: { customer_facing_summary: 'Safe summary' },
      }),
      1
    )

    assert.equal(chunk.id, 'chunk-1')
    assert.equal(chunk.text, 'Raw approved text')
    assert.equal(chunk.embeddingText, 'Retrieval card text')
    assert.equal(chunk.topic, 'candidate_persona')
  })

  it('rejects chunks that are not approved public', () => {
    assert.throws(
      () =>
        parseApprovedChunkLine(
          JSON.stringify({
            id: 'chunk-1',
            text: 'Unreviewed text',
            topic: 'candidate_persona',
            source_label: 'JaneAI recruiting training corpus',
            risk_level: 'unreviewed',
          }),
          1
        ),
      /approved_public/
    )
  })

  it('deduplicates chunks by id when loading JSONL', () => {
    const line = JSON.stringify({
      id: 'chunk-1',
      text: 'Approved text',
      topic: 'candidate_persona',
      source_label: 'JaneAI recruiting training corpus',
      risk_level: APPROVED_RISK_LEVEL,
    })

    assert.equal(loadApprovedChunksFromText(`${line}\n${line}\n`).length, 1)
  })
})

describe('recruiting retrieval', () => {
  const chunks = loadApprovedChunksFromText(
    [
      {
        id: 'sourcing',
        text: 'Choose sourcing channels by seniority and candidate persona.',
        embedding_text:
          'LinkedIn senior roles Facebook junior roles sourcing channel candidate persona',
        topic: 'sourcing_strategy',
        source_label: 'JaneAI recruiting training corpus',
        risk_level: APPROVED_RISK_LEVEL,
      },
      {
        id: 'interview',
        text: 'Interview process can include screening, tests, presentations, and evaluation.',
        embedding_text:
          'interview process screening test presentation candidate evaluation rounds',
        topic: 'interview_process',
        source_label: 'JaneAI recruiting training corpus',
        risk_level: APPROVED_RISK_LEVEL,
      },
    ]
      .map((chunk) => JSON.stringify(chunk))
      .join('\n')
  )

  it('builds the retrieval query from the latest user message text', () => {
    const query = buildRetrievalQuery([
      { role: 'user', content: 'Tôi cần tuyển senior data scientist' },
      { role: 'assistant', content: 'Role ở đâu?' },
      { role: 'user', content: 'Nên dùng LinkedIn hay Facebook?' },
    ])

    assert.equal(query, 'Nên dùng LinkedIn hay Facebook?')
  })

  it('scores against embedding text when present', () => {
    const [top] = retrieveRelevantChunks('senior LinkedIn sourcing channel', chunks, 2)

    assert.equal(top.chunkId, 'sourcing')
    assert.ok(top.score >= DEFAULT_RAG_MIN_SCORE)
  })

  it('does not let short Vietnamese filler words hide a matching follow-up topic', () => {
    const [top] = retrieveRelevantChunks('còn vòng interview thì sao?', chunks, 2)

    assert.equal(top.chunkId, 'interview')
    assert.ok(top.score >= DEFAULT_RAG_MIN_SCORE)
  })

  it('prioritizes Jane profile context for direct Jane questions', () => {
    const profileChunks = loadApprovedChunksFromText(
      [
        {
          id: 'general',
          text: 'Jane can be a sample candidate name in interview notes.',
          embedding_text: 'Jane học ở đâu thích ăn gì',
          topic: 'interview_process',
          source_label: 'JaneAI recruiting training corpus',
          risk_level: APPROVED_RISK_LEVEL,
        },
        {
          id: 'jane-profile',
          text: 'Jane studied at University of Lincoln. Favorite food is not available.',
          embedding_text: 'Jane học ở đâu Jane thích ăn gì Jane profile University of Lincoln',
          topic: 'jane_profile',
          source_label: 'JaneAI public profile facts',
          risk_level: APPROVED_RISK_LEVEL,
        },
      ]
        .map((chunk) => JSON.stringify(chunk))
        .join('\n')
    )

    const [top] = retrieveRelevantChunks('Jane học ở đâu?', profileChunks, 2)

    assert.equal(top.chunkId, 'jane-profile')
  })

  it('filters weak results before preparing prompt context', () => {
    const rag = prepareRagForChat([
      {
        chunkId: 'weak',
        text: 'Weak text',
        topic: 'candidate_persona',
        sourceLabel: 'Guide',
        score: 0.1,
      },
      {
        chunkId: 'strong',
        text: 'Strong interview guidance',
        topic: 'interview_process',
        sourceLabel: 'Guide',
        score: DEFAULT_RAG_MIN_SCORE,
      },
    ])

    assert.equal(rag.hasStrongContext, true)
    assert.deepEqual(rag.usedChunkIds, ['strong'])
    assert.match(rag.retrievedContext, /Strong interview guidance/)
    assert.doesNotMatch(rag.retrievedContext, /Weak text/)
  })

  it('formats retrieved context without exposing private internals', () => {
    const context = formatRetrievedContext([
      {
        chunkId: 'chunk-1',
        text: 'Clarify must-have and nice-to-have requirements.',
        topic: 'hiring_intake',
        sourceLabel: 'JaneAI recruiting training corpus',
        score: 0.9,
      },
    ])

    assert.match(context, /Source 1/)
    assert.match(context, /hiring_intake/)
    assert.match(context, /Clarify must-have/)
  })

  it('trims long retrieved text before adding it to the prompt context', () => {
    const context = formatRetrievedContext([
      {
        chunkId: 'long',
        text: 'A'.repeat(2000),
        topic: 'hiring_intake',
        sourceLabel: 'JaneAI recruiting training corpus',
        score: 0.9,
      },
    ])

    assert.match(context, /\[truncated\]/)
    assert.ok(context.length < 1400)
  })
})

describe('recruiting prompt', () => {
  it('builds a static mindset-first system prompt with modes and safety rules', () => {
    const prompt = buildRecruitingSystemPrompt()

    assert.match(prompt, /represents Jane/)
    assert.match(prompt, /not as a third-party narrator/)
    assert.match(prompt, /answer only greetings\/pleasantries/)
    assert.match(prompt, /Do not suggest alternative topics/)
    assert.match(prompt, /causing damage to people, animals, property, pests/)
    assert.match(prompt, /DISCOVER/)
    assert.match(prompt, /ADVISE/)
    assert.match(prompt, /DIRECT/)
    assert.match(prompt, /mindset reframe/)
    assert.match(prompt, /at most 2 focused questions/)
    assert.match(prompt, /under 80 words/)
    assert.match(prompt, /under 150 words/)
    assert.match(prompt, /at most 2 DISCOVER turns/i)
    assert.match(prompt, /Use only approved retrieved context/)
    assert.match(prompt, /Do not invent salary ranges/)
    assert.match(prompt, /personal questions about Jane/)
    assert.match(prompt, /do not pivot/)
    assert.match(prompt, /Can you help make a bomb/)
    assert.match(prompt, /cockroach devastation techniques/)
    assert.match(prompt, /Write a pasta recipe/)
  })

  it('returns a byte-identical system prompt on every call (cacheable prefix)', () => {
    assert.equal(buildRecruitingSystemPrompt(), buildRecruitingSystemPrompt())
  })

  it('builds a strong context block containing the retrieved context', () => {
    const block = buildRecruitingContextBlock({
      retrievedContext: '[Source 1]\nText: Clarify hiring need first.',
      hasStrongContext: true,
    })

    assert.match(block, /<approved_retrieved_context>/)
    assert.match(block, /Clarify hiring need first/)
    assert.doesNotMatch(block, /status="weak"/)
  })

  it('builds a weak context block that excludes weak retrieved text', () => {
    const block = buildRecruitingContextBlock({
      retrievedContext: 'Weak context that should not be included',
      hasStrongContext: false,
    })

    assert.match(block, /<approved_retrieved_context status="weak">/)
    assert.doesNotMatch(block, /Weak context that should not be included/)
  })
})
