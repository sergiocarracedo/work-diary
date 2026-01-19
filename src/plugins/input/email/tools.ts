import type { EmailMessage } from './types'

export type EmailPromptInput = {
  date: Date
  provider: string
  messages: EmailMessage[]
  fromFilters?: string[]
  toFilters?: string[]
}

const formatTime = (date: Date): string => {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

const truncate = (text: string | undefined, limit = 200): string => {
  if (!text) return ''
  return text.length > limit ? `${text.slice(0, limit)}...` : text
}

export const buildPrompt = (input: EmailPromptInput): string => {
  const lines: string[] = []
  const sorted = [...input.messages].sort((a, b) => a.date.getTime() - b.date.getTime())

  lines.push('You are summarizing a day of email activity (sent and received).')
  lines.push('Highlight key work themes, decisions, follow-ups, and noteworthy correspondents.')
  lines.push('Be concise (2-4 paragraphs) and write in the first person.')
  lines.push(`Date: ${input.date.toISOString().split('T')[0]}`)
  lines.push(`Provider: ${input.provider}`)

  if (input.fromFilters?.length) {
    lines.push(`From filter: ${input.fromFilters.join(', ')}`)
  }
  if (input.toFilters?.length) {
    lines.push(`To filter: ${input.toFilters.join(', ')}`)
  }

  lines.push('')
  lines.push('Messages:')

  for (const message of sorted) {
    const toList = message.to.length > 0 ? message.to.join(', ') : '(no to)'
    const from = message.from ?? '(unknown sender)'
    const snippet = truncate(message.snippet)
    lines.push(
      `- ${formatTime(message.date)} [${message.mailbox}] ${from} -> ${toList} | ${message.subject}${snippet ? ` | Snippet: ${snippet}` : ''}`,
    )
  }

  lines.push('')
  lines.push(
    'Write a cohesive summary of the day. Emphasize outcomes, commitments, blockers, and follow-ups.',
  )

  return lines.join('\n')
}
