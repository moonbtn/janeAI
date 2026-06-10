export type ChatInline = {
  text: string
  bold: boolean
}

export type ChatMarkdownBlock =
  | {
      type: 'heading'
      level: 2 | 3
      children: ChatInline[]
    }
  | {
      type: 'paragraph'
      children: ChatInline[]
    }
  | {
      type: 'list'
      items: ChatInline[][]
    }

export function parseInlineMarkdown(value: string): ChatInline[] {
  const parts: ChatInline[] = []
  const pattern = /\*\*([^*]+)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(value)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: value.slice(lastIndex, match.index), bold: false })
    }
    parts.push({ text: match[1], bold: true })
    lastIndex = pattern.lastIndex
  }

  if (lastIndex < value.length) {
    parts.push({ text: value.slice(lastIndex), bold: false })
  }

  return parts.length > 0 ? parts : [{ text: value, bold: false }]
}

export function parseChatMarkdown(value: string): ChatMarkdownBlock[] {
  const blocks: ChatMarkdownBlock[] = []
  let listItems: ChatInline[][] = []

  function flushList() {
    if (listItems.length === 0) return
    blocks.push({ type: 'list', items: listItems })
    listItems = []
  }

  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) {
      flushList()
      continue
    }

    const heading = /^(#{2,3})\s+(.+)$/.exec(line)
    if (heading) {
      flushList()
      blocks.push({
        type: 'heading',
        level: heading[1].length as 2 | 3,
        children: parseInlineMarkdown(heading[2].trim()),
      })
      continue
    }

    const bullet = /^[-*]\s+(.+)$/.exec(line)
    if (bullet) {
      listItems.push(parseInlineMarkdown(bullet[1].trim()))
      continue
    }

    flushList()
    blocks.push({
      type: 'paragraph',
      children: parseInlineMarkdown(line),
    })
  }

  flushList()
  return blocks
}
