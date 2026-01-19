import { createPluginConfigParser } from '@/plugins/config'
import {
  SlackService,
  countReactions,
  isUserMessage,
  normalizeReactions,
} from '@/plugins/input/slack/service'
import type { Plugin, PluginRetrieveContext } from '@/types/plugins'
import { getDateRange } from '@/utils/date'
import { z } from 'zod/v4'
import type { SlackConversationActivity, SlackThreadActivity, SlackUserMessage } from './tools'
import { buildPrompt } from './tools'

const slackConfigSchema = z.object({
  token: z.string().min(1).describe('Slack bot or user token with the required scopes'),
  users: z
    .array(z.string().min(1))
    .nonempty()
    .describe('Slack user IDs to summarize (only their messages are considered)'),
  include: z
    .array(z.string().min(1))
    .default([])
    .describe('Conversation IDs to include (channels or DMs). If empty, all are allowed.'),
  exclude: z
    .array(z.string().min(1))
    .default([])
    .describe('Conversation IDs to exclude. Exclusion wins if an ID is in both lists.'),
  includeDMs: z.boolean().default(false).describe('Whether to fetch DMs and group DMs'),
  maxChannels: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(50)
    .describe('Maximum conversations to scan'),
  maxMessagesPerChannel: z
    .number()
    .int()
    .min(1)
    .max(2000)
    .default(400)
    .describe('Maximum messages to pull per conversation within the window'),
})

export type SlackConfig = z.infer<typeof slackConfigSchema>

const buildConversationName = (
  name: string | undefined,
  type: 'channel' | 'dm' | 'group',
  id: string,
): string => {
  if (name) {
    return type === 'channel' ? `#${name}` : name
  }
  return id
}

const SlackPlugin: Plugin<typeof slackConfigSchema> = {
  name: 'slack',
  configSchema: slackConfigSchema,
  parseConfig: createPluginConfigParser('slack', slackConfigSchema),
  description: 'Summarizes Slack messages, threads, and reactions for specified users.',
  retrieve: async (ctx: PluginRetrieveContext, config: SlackConfig) => {
    const { start, end } = getDateRange(ctx.date)
    const oldest = Math.floor(start.getTime() / 1000)
    const latest = Math.floor(end.getTime() / 1000)

    const targetUsers = new Set(config.users)
    const include = new Set(config.include)
    const exclude = new Set(config.exclude)
    const slack = new SlackService(config.token, ctx.logger)

    const types = config.includeDMs
      ? 'public_channel,private_channel,mpim,im'
      : 'public_channel,private_channel'

    const conversations = await slack.listConversations(types, config.maxChannels)

    const allowed = conversations.filter((conversation) => {
      const id = conversation.id
      if (!config.includeDMs && (conversation.is_im || conversation.is_mpim)) {
        return false
      }
      if (exclude.has(id)) {
        return false
      }
      if (include.size > 0 && !include.has(id)) {
        return false
      }
      return true
    })

    const activities: SlackConversationActivity[] = []

    let totalMessages = 0
    let totalThreads = 0
    let totalThreadReplies = 0
    let totalReactions = 0

    for (const conversation of allowed) {
      const history = await slack.fetchConversationHistory(
        conversation.id,
        oldest,
        latest,
        config.maxMessagesPerChannel,
      )

      const targetMessages = history
        .filter(isUserMessage)
        .filter((msg) => targetUsers.has(msg.user))

      if (targetMessages.length === 0) {
        continue
      }

      const threadIds = new Set<string>()
      const standaloneMessages: SlackUserMessage[] = []

      for (const msg of targetMessages) {
        if (msg.thread_ts) {
          threadIds.add(msg.thread_ts)
          continue
        }
        standaloneMessages.push({
          ts: msg.ts,
          text: msg.text ?? '',
          user: msg.user,
          reactions: normalizeReactions(msg.reactions),
        })
      }

      const threads: SlackThreadActivity[] = []

      for (const threadTs of threadIds) {
        const threadMessages = await slack.fetchThreadReplies(
          conversation.id,
          threadTs,
          oldest,
          latest,
        )

        if (threadMessages.length === 0) continue

        const root = threadMessages[0]
        if (!root) continue
        const rootUser = root.user
        const targetThreadMessages = threadMessages
          .filter(isUserMessage)
          .filter((msg) => targetUsers.has(msg.user))

        if (targetThreadMessages.length === 0) continue

        threads.push({
          threadTs,
          root: {
            ts: root.ts,
            ...(rootUser ? { user: rootUser } : {}),
            text: root.text ?? '',
            reactions: normalizeReactions(root.reactions),
          },
          userMessages: targetThreadMessages.map((msg) => ({
            ts: msg.ts,
            text: msg.text ?? '',
            user: msg.user,
            reactions: normalizeReactions(msg.reactions),
          })),
        })

        totalMessages += targetThreadMessages.length
        totalThreadReplies += targetThreadMessages.filter((msg) => msg.ts !== threadTs).length
        totalReactions += targetThreadMessages.reduce(
          (acc, msg) => acc + countReactions(msg.reactions),
          0,
        )
      }

      totalMessages += standaloneMessages.length
      totalThreads += threads.length
      totalReactions += standaloneMessages.reduce(
        (acc, msg) => acc + countReactions(msg.reactions),
        0,
      )

      activities.push({
        id: conversation.id,
        name: buildConversationName(
          conversation.name,
          conversation.is_im ? 'dm' : conversation.is_mpim ? 'group' : 'channel',
          conversation.id,
        ),
        type: conversation.is_im ? 'dm' : conversation.is_mpim ? 'group' : 'channel',
        messages: standaloneMessages,
        threads,
      })
    }

    const resolvedUsers = await slack.resolveUserNames(config.users)

    const diaryDate = ctx.date.toISOString().split('T')[0] ?? ''

    const prompt = buildPrompt({
      date: diaryDate,
      users: resolvedUsers,
      conversations: activities,
    })

    let summary = 'No Slack activity recorded.'

    if (activities.length > 0) {
      const aiSummary = await ctx.aiSummarizer(prompt)
      const stats = [
        `Conversations scanned: ${allowed.length}`,
        `Messages from targets: ${totalMessages}`,
        `Threads touched: ${totalThreads}`,
        `Thread replies from targets: ${totalThreadReplies}`,
        `Reactions on their messages: ${totalReactions}`,
      ]

      summary = `${aiSummary}\n\n- ${stats.join('\n- ')}`
    }

    return {
      pluginName: 'Slack',
      summary,
      metadata: {
        activities,
        stats: {
          conversationsScanned: allowed.length,
          messagesFromTargets: totalMessages,
          threads: totalThreads,
          threadRepliesFromTargets: totalThreadReplies,
          reactionsOnTargetMessages: totalReactions,
        },
      },
    }
  },
}

export default SlackPlugin
