import type { ResolvedUser, SlackReaction } from './service'

export type SlackUserMessage = {
  ts: string
  user: string
  text: string
  reactions: SlackReaction[]
}

export type SlackThreadActivity = {
  threadTs: string
  root: {
    ts: string
    user?: string
    text: string
    reactions: SlackReaction[]
  }
  userMessages: SlackUserMessage[]
}

export type SlackConversationActivity = {
  id: string
  name: string
  type: 'channel' | 'dm' | 'group'
  messages: SlackUserMessage[]
  threads: SlackThreadActivity[]
}

export type SlackPromptInput = {
  date: string
  users: ResolvedUser[]
  conversations: SlackConversationActivity[]
}

const formatTime = (ts: string): string => {
  const millis = Number.parseFloat(ts) * 1000
  const date = new Date(Number.isFinite(millis) ? millis : 0)
  return date.toISOString().substring(11, 16)
}

const truncate = (text: string, limit = 320): string => {
  if (text.length <= limit) return text
  return `${text.slice(0, limit)}...`
}

const renderReactions = (reactions: SlackReaction[]): string => {
  if (!reactions.length) return ''
  const parts = reactions.map((r) => `${r.name}:${r.count}`)
  return ` [reactions: ${parts.join(', ')}]`
}

export const buildPrompt = (input: SlackPromptInput): string => {
  const userMap = new Map(input.users.map((u) => [u.id, u.name]))
  const lines: string[] = []

  lines.push('You are summarizing Slack activity for the specified users only.')
  lines.push(
    'Do not attribute messages from users outside the provided list except as context for threads.',
  )
  lines.push(
    'Highlight key work themes, decisions, blockers, and follow-ups; keep it concise (2-4 paragraphs).',
  )
  lines.push(`Date: ${input.date}`)
  lines.push(`Users: ${input.users.map((u) => `${u.name} (${u.id})`).join(', ')}`)
  lines.push('')
  lines.push('Data:')

  for (const convo of input.conversations) {
    lines.push(`Conversation: ${convo.name} (${convo.type})`)

    for (const message of convo.messages) {
      const author = userMap.get(message.user) ?? message.user
      lines.push(
        `- ${formatTime(message.ts)} ${author}: ${truncate(message.text)}${renderReactions(message.reactions)}`,
      )
    }

    for (const thread of convo.threads) {
      const rootAuthor = thread.root.user
        ? (userMap.get(thread.root.user) ?? thread.root.user)
        : 'unknown'
      lines.push(
        `- Thread ${thread.threadTs} started by ${rootAuthor}: ${truncate(thread.root.text)}${renderReactions(thread.root.reactions)}`,
      )
      for (const reply of thread.userMessages) {
        const author = userMap.get(reply.user) ?? reply.user
        lines.push(
          `  - ${formatTime(reply.ts)} ${author}: ${truncate(reply.text)}${renderReactions(reply.reactions)}`,
        )
      }
    }

    lines.push('')
  }

  lines.push(
    'Summarize only what these users did, referencing channels/DMs when helpful. Include thread/reaction insights where relevant.',
  )

  return lines.join('\n')
}
