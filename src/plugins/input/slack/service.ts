import type { Logger } from '@/types'

const SLACK_API_BASE = 'https://slack.com/api/'

type SlackApiBase = {
  ok: boolean
  error?: string
  response_metadata?: {
    next_cursor?: string
  }
}

export type SlackReaction = {
  name: string
  count: number
}

export type SlackMessage = {
  ts: string
  user?: string
  text?: string
  thread_ts?: string
  subtype?: string
  reactions?: SlackReaction[]
  reply_count?: number
}

export type SlackConversation = {
  id: string
  name?: string
  is_channel?: boolean
  is_group?: boolean
  is_im?: boolean
  is_mpim?: boolean
  is_private?: boolean
  user?: string
}

type ConversationListResponse = SlackApiBase & {
  channels: SlackConversation[]
}

type ConversationHistoryResponse = SlackApiBase & {
  messages: SlackMessage[]
  has_more?: boolean
}

type ThreadReplyResponse = SlackApiBase & {
  messages: SlackMessage[]
  has_more?: boolean
}

type UserInfoResponse = SlackApiBase & {
  user?: {
    id: string
    name?: string
    real_name?: string
    profile?: {
      display_name?: string
      real_name?: string
    }
  }
}

export type ResolvedUser = {
  id: string
  name: string
}

export class SlackService {
  private userCache = new Map<string, string>()

  constructor(
    private token: string,
    private logger: Logger,
  ) {}

  private async api<T extends SlackApiBase>(
    method: string,
    params: Record<string, string | number | boolean | undefined> = {},
  ): Promise<T> {
    const url = new URL(`${SLACK_API_BASE}${method}`)
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue
      url.searchParams.set(key, String(value))
    }

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    })

    if (!res.ok) {
      throw new Error(`Slack API request failed (${method}): HTTP ${res.status}`)
    }

    const json = (await res.json()) as T

    if (!json.ok) {
      throw new Error(`Slack API error (${method}): ${json.error ?? 'unknown'}`)
    }

    return json
  }

  async listConversations(types: string, maxCount: number): Promise<SlackConversation[]> {
    let cursor: string | undefined
    const conversations: SlackConversation[] = []

    while (true) {
      const resp = await this.api<ConversationListResponse>('conversations.list', {
        types,
        limit: 200,
        cursor,
      })

      conversations.push(...resp.channels)

      if (!resp.response_metadata?.next_cursor || conversations.length >= maxCount) {
        break
      }
      cursor = resp.response_metadata.next_cursor
    }

    return conversations.slice(0, maxCount)
  }

  async fetchConversationHistory(
    channel: string,
    oldest: number,
    latest: number,
    maxMessages: number,
  ): Promise<SlackMessage[]> {
    let cursor: string | undefined
    const messages: SlackMessage[] = []

    while (true) {
      const resp = await this.api<ConversationHistoryResponse>('conversations.history', {
        channel,
        oldest,
        latest,
        limit: 200,
        cursor,
        inclusive: true,
      })

      messages.push(...resp.messages)

      if (
        !resp.has_more ||
        messages.length >= maxMessages ||
        !resp.response_metadata?.next_cursor
      ) {
        break
      }

      cursor = resp.response_metadata.next_cursor
    }

    return messages.slice(0, maxMessages)
  }

  async fetchThreadReplies(
    channel: string,
    threadTs: string,
    oldest: number,
    latest: number,
  ): Promise<SlackMessage[]> {
    let cursor: string | undefined
    const messages: SlackMessage[] = []

    while (true) {
      const resp = await this.api<ThreadReplyResponse>('conversations.replies', {
        channel,
        ts: threadTs,
        oldest,
        latest,
        limit: 200,
        cursor,
        inclusive: true,
      })

      messages.push(...resp.messages)

      if (!resp.has_more || !resp.response_metadata?.next_cursor) {
        break
      }

      cursor = resp.response_metadata.next_cursor
    }

    return messages
  }

  private extractDisplayName(user?: UserInfoResponse['user']): string | undefined {
    if (!user) return undefined
    return (
      user.profile?.display_name ||
      user.profile?.real_name ||
      user.real_name ||
      user.name ||
      user.id
    )
  }

  async resolveUserName(userId: string): Promise<string> {
    if (this.userCache.has(userId)) {
      return this.userCache.get(userId) as string
    }

    try {
      const resp = await this.api<UserInfoResponse>('users.info', { user: userId })
      const name = this.extractDisplayName(resp.user) ?? userId
      this.userCache.set(userId, name)
      return name
    } catch (error) {
      this.logger.warn(`Unable to resolve Slack user name for ${userId}: ${String(error)}`)
      this.userCache.set(userId, userId)
      return userId
    }
  }

  async resolveUserNames(userIds: string[]): Promise<ResolvedUser[]> {
    const uniqueIds = Array.from(new Set(userIds))
    return Promise.all(uniqueIds.map(async (id) => ({ id, name: await this.resolveUserName(id) })))
  }
}

export const normalizeReactions = (reactions?: SlackReaction[]): SlackReaction[] => {
  if (!reactions || reactions.length === 0) return []
  return reactions.map((r) => ({
    name: r.name,
    count: typeof r.count === 'number' ? r.count : 0,
  }))
}

export const countReactions = (reactions?: SlackReaction[]): number => {
  return normalizeReactions(reactions).reduce((acc, r) => acc + r.count, 0)
}

export const isUserMessage = (msg: SlackMessage): msg is SlackMessage & { user: string } => {
  return !!msg.user && (!msg.subtype || msg.subtype === 'thread_broadcast')
}
