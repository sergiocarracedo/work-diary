import { createPluginConfigParser } from '@/plugins/config'
import type { Plugin, PluginRetrieveContext } from '@/types/plugins'
import { z } from 'zod/v4'
import { EmailService } from './service'
import { buildPrompt } from './tools'

const filterSchema = z.object({
  from: z.array(z.string().email()).optional(),
  to: z.array(z.string().email()).optional(),
})

const imapSchema = z
  .object({
    provider: z.literal('imap'),
    host: z.string().min(1),
    port: z.number().int().positive(),
    secure: z.boolean().default(true),
    user: z.string().min(1),
    password: z.string().min(1),
    mailbox: z.string().default('INBOX'),
    sentMailbox: z.string().default('Sent'),
    maxMessages: z.number().int().min(1).max(500).default(200),
  })
  .merge(filterSchema)

const pop3Schema = z
  .object({
    provider: z.literal('pop3'),
    host: z.string().min(1),
    port: z.number().int().positive(),
    tls: z.boolean().default(true),
    user: z.string().min(1),
    password: z.string().min(1),
    maxMessages: z.number().int().min(1).max(500).default(200),
  })
  .merge(filterSchema)

const gmailSchema = z
  .object({
    provider: z.literal('gmail'),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    refreshToken: z.string().min(1),
    accessToken: z.string().optional(),
    userId: z.string().default('me'),
    labelIds: z.array(z.string()).default(['INBOX', 'SENT']),
    maxMessages: z.number().int().min(1).max(500).default(200),
  })
  .merge(filterSchema)

export const emailConfigSchema = z.discriminatedUnion('provider', [
  imapSchema,
  pop3Schema,
  gmailSchema,
])

export type EmailConfig = z.infer<typeof emailConfigSchema>

const EmailInputPlugin: Plugin<typeof emailConfigSchema> = {
  name: 'email',
  configSchema: emailConfigSchema,
  parseConfig: createPluginConfigParser('email', emailConfigSchema),
  description:
    'Fetches daily email (IMAP, POP3, or Gmail API) and summarizes sent/received conversations.',
  retrieve: async (ctx: PluginRetrieveContext, config: EmailConfig) => {
    const emailService = new EmailService(config, ctx.logger)
    const messages = await emailService.fetchDay(ctx.date)

    if (messages.length === 0) {
      return {
        pluginName: 'Email',
        summary: 'No email activity recorded.',
        metadata: { provider: config.provider, messages },
      }
    }

    const promptInput = {
      date: ctx.date,
      provider: config.provider,
      messages,
    } as const

    if (config.from && config.from.length > 0) {
      ;(promptInput as { fromFilters?: string[] }).fromFilters = config.from
    }
    if (config.to && config.to.length > 0) {
      ;(promptInput as { toFilters?: string[] }).toFilters = config.to
    }

    const prompt = buildPrompt(promptInput)

    const aiSummary = await ctx.aiSummarizer(prompt)
    const inboxCount = messages.filter((m) => m.mailbox === 'inbox').length
    const sentCount = messages.filter((m) => m.mailbox === 'sent').length
    const stats = `Messages: ${messages.length} (inbox: ${inboxCount}, sent: ${sentCount})`

    return {
      pluginName: 'Email',
      summary: `${aiSummary}\n\n- ${stats}`,
      metadata: {
        provider: config.provider,
        messages,
        stats: { inbox: inboxCount, sent: sentCount, total: messages.length },
      },
    }
  },
}

export default EmailInputPlugin
