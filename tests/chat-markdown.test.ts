import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseChatMarkdown } from '@/lib/recruiting-rag/chat-markdown'

describe('chat markdown parsing', () => {
  it('parses headings, bullets, paragraphs, and bold spans for assistant answers', () => {
    const blocks = parseChatMarkdown(`### French screen nên test sớm
Không cần dài, nhưng phải thực tế:
- hỏi họ mô tả project gần nhất bằng French
- **French chỉ là self-report**

## 5) Common sourcing risks
- Senior title nhưng scope không senior`)

    assert.deepEqual(blocks, [
      {
        type: 'heading',
        level: 3,
        children: [{ text: 'French screen nên test sớm', bold: false }],
      },
      {
        type: 'paragraph',
        children: [{ text: 'Không cần dài, nhưng phải thực tế:', bold: false }],
      },
      {
        type: 'list',
        items: [
          [{ text: 'hỏi họ mô tả project gần nhất bằng French', bold: false }],
          [{ text: 'French chỉ là self-report', bold: true }],
        ],
      },
      {
        type: 'heading',
        level: 2,
        children: [{ text: '5) Common sourcing risks', bold: false }],
      },
      {
        type: 'list',
        items: [[{ text: 'Senior title nhưng scope không senior', bold: false }]],
      },
    ])
  })
})
