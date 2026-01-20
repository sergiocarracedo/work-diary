import type { Logger } from '@/types'
import { getDateRange } from '@/utils/date'
import { google } from 'googleapis'
import { ImapFlow } from 'imapflow'
import type { AddressObject, EmailAddress, ParsedMail } from 'mailparser'
import { simpleParser } from 'mailparser'
import Pop3Command from 'node-pop3'
import crypto from 'node:crypto'
import type {
  EmailConfig,
  EmailMessage,
  GmailEmailConfig,
  ImapEmailConfig,
  Pop3EmailConfig,
} from './types'

const normalizeAddresses = (addresses?: string[]): string[] => {
  return (addresses ?? []).map((addr) => addr.trim().toLowerCase()).filter(Boolean)
}

const pickAddress = (input?: string | null): string | undefined => {
  if (!input) return undefined
  const cleaned = input.trim()
  if (!cleaned) return undefined
  return cleaned
}

const pickAddressesFromList = (
  list: Array<{ address?: string | undefined | null }> | undefined,
): string[] => {
  return (list ?? [])
    .map((item) => item.address?.trim())
    .filter((addr): addr is string => Boolean(addr))
}

const extractEmailAddresses = (
  addresses?: AddressObject | AddressObject[] | null,
): EmailAddress[] => {
  if (!addresses) return []
  const list = Array.isArray(addresses) ? addresses : [addresses]
  return list.flatMap((entry) => entry.value ?? [])
}

const extractSnippet = (text?: string | null, limit = 240): string | undefined => {
  if (!text) return undefined
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return undefined
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized
}

export class EmailService {
  constructor(
    private readonly config: EmailConfig,
    private readonly logger: Logger,
  ) {}

  async fetchDay(date: Date): Promise<EmailMessage[]> {
    const { start, end } = getDateRange(date)

    if (this.config.provider === 'imap') {
      return this.fetchImap(this.config, start, end)
    }

    if (this.config.provider === 'pop3') {
      return this.fetchPop3(this.config, start, end)
    }

    return this.fetchGmail(this.config, start, end)
  }

  private isWithinRange(date: Date | undefined, start: Date, end: Date): boolean {
    if (!date || Number.isNaN(date.getTime())) return false
    return date >= start && date <= end
  }

  private matchesFilters(message: EmailMessage): boolean {
    const fromFilters = normalizeAddresses(this.config.from)
    const toFilters = normalizeAddresses(this.config.to)

    const fromOk =
      fromFilters.length === 0 ||
      (message.from ? fromFilters.includes(message.from.toLowerCase()) : false)

    const toOk =
      toFilters.length === 0 ||
      message.to.some((addr) => {
        return toFilters.includes(addr.toLowerCase())
      })

    return fromOk && toOk
  }

  private toEmailMessage(
    parsed: ParsedMail,
    mailbox: 'inbox' | 'sent',
    fallbackId: string,
  ): EmailMessage {
    const fromAddress = pickAddressesFromList(extractEmailAddresses(parsed.from))[0]
    const toAddresses = pickAddressesFromList(extractEmailAddresses(parsed.to))
    const from = pickAddress(fromAddress)

    const snippet = extractSnippet(parsed.text ?? parsed.textAsHtml)

    const msg: EmailMessage = {
      id: parsed.messageId || fallbackId,
      subject: parsed.subject || '(no subject)',
      to: toAddresses,
      date: parsed.date ?? new Date(),
      mailbox,
    }

    if (snippet) {
      msg.snippet = snippet
    }

    if (from) {
      msg.from = from
    }

    return msg
  }

  private async fetchImap(
    config: ImapEmailConfig,
    start: Date,
    end: Date,
  ): Promise<EmailMessage[]> {
    const client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.password,
      },
    })

    const collected: EmailMessage[] = []

    const fetchMailbox = async (mailbox: string, mailboxType: 'inbox' | 'sent'): Promise<void> => {
      let lock
      try {
        lock = await client.getMailboxLock(mailbox)
      } catch (error) {
        const err = error as { mailboxMissing?: boolean; message?: string }
        if (err?.mailboxMissing) {
          this.logger.warn(
            `IMAP mailbox "${mailbox}" (${mailboxType}) not found; skipping ${mailboxType} sync. ` +
              'Configure email.sentMailbox to match your provider (e.g., "Sent Items" or "INBOX.Sent").',
          )
          return
        }
        throw error
      }
      try {
        for await (const message of client.fetch(
          { since: start, before: new Date(end.getTime() + 1000) },
          { source: true, envelope: true },
        )) {
          if (collected.length >= config.maxMessages) {
            break
          }
          const parsed = await simpleParser(message.source as Buffer)
          const normalized = this.toEmailMessage(
            parsed,
            mailboxType,
            String(message.uid ?? crypto.randomUUID()),
          )
          if (this.isWithinRange(normalized.date, start, end) && this.matchesFilters(normalized)) {
            collected.push(normalized)
          }
        }
      } finally {
        lock?.release()
      }
    }

    try {
      await client.connect()
      await fetchMailbox(config.mailbox, 'inbox')
      await fetchMailbox(config.sentMailbox, 'sent')
    } finally {
      try {
        await client.logout()
      } catch (error) {
        this.logger.warn(`Failed to close IMAP connection: ${error}`)
      }
    }

    return collected.sort((a, b) => a.date.getTime() - b.date.getTime())
  }

  private async fetchPop3(
    config: Pop3EmailConfig,
    start: Date,
    end: Date,
  ): Promise<EmailMessage[]> {
    const client = new Pop3Command({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      ...(config.tls ? { tls: true, tlsOptions: { rejectUnauthorized: false } } : { tls: false }),
    })

    const messages: EmailMessage[] = []

    try {
      await client.connect()
      await client.command('USER', config.user)
      await client.command('PASS', config.password)

      const uidlList = await client.UIDL()
      const allMessageIds = uidlList
        .map((entry) => (Array.isArray(entry) ? entry[0] : undefined))
        .map((id) => Number.parseInt(String(id ?? ''), 10))
        .filter((id) => Number.isFinite(id))

      if (allMessageIds.length === 0) {
        return []
      }

      const limit = Math.max(0, Math.min(config.maxMessages, allMessageIds.length))
      const targetIds = allMessageIds.slice(allMessageIds.length - limit)

      for (const messageId of targetIds.reverse()) {
        try {
          const rawMessage = await client.RETR(messageId)
          const parsed = await simpleParser(rawMessage)
          const normalized = this.toEmailMessage(parsed, 'inbox', String(messageId))
          if (this.isWithinRange(normalized.date, start, end) && this.matchesFilters(normalized)) {
            messages.push(normalized)
          }
        } catch (error) {
          this.logger.warn(`POP3 message parsing failed (${messageId}): ${error}`)
        }
      }
    } finally {
      try {
        await client.QUIT()
      } catch (error) {
        this.logger.warn(`POP3 QUIT error: ${error}`)
      }
    }

    return messages.sort((a, b) => a.date.getTime() - b.date.getTime())
  }

  private async fetchGmail(
    config: GmailEmailConfig,
    start: Date,
    end: Date,
  ): Promise<EmailMessage[]> {
    const oauth2 = new google.auth.OAuth2(config.clientId, config.clientSecret)
    const credentials: Parameters<typeof oauth2.setCredentials>[0] = {
      refresh_token: config.refreshToken,
    }
    if (config.accessToken !== undefined) {
      credentials.access_token = config.accessToken
    }
    oauth2.setCredentials(credentials)

    const gmail = google.gmail({ version: 'v1', auth: oauth2 })
    const after = new Date(start.getTime() - 24 * 60 * 60 * 1000)
    const before = new Date(end.getTime() + 24 * 60 * 60 * 1000)

    const toDateToken = (d: Date): string => {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}/${m}/${day}`
    }

    const filters: string[] = []
    filters.push(`after:${toDateToken(after)}`)
    filters.push(`before:${toDateToken(before)}`)

    if (config.from && config.from.length > 0) {
      filters.push(`from:(${config.from.join(' OR ')})`)
    }

    if (config.to && config.to.length > 0) {
      filters.push(`to:(${config.to.join(' OR ')})`)
    }

    const query = filters.join(' ')

    const { data } = await gmail.users.messages.list({
      userId: config.userId,
      labelIds: config.labelIds,
      maxResults: config.maxMessages,
      q: query,
    })

    const ids = data.messages ?? []
    const messages: EmailMessage[] = []

    for (const m of ids) {
      if (!m.id) continue
      const { data: message } = await gmail.users.messages.get({
        userId: config.userId,
        id: m.id,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date'],
      })

      const headers = message.payload?.headers ?? []
      const readHeader = (name: string): string | undefined => {
        const header = (headers as Array<{ name?: string; value?: string }>).find(
          (h) => h.name?.toLowerCase() === name.toLowerCase(),
        )
        return header?.value ?? undefined
      }

      const date = readHeader('Date') ? new Date(readHeader('Date') as string) : undefined

      const snippet = extractSnippet(message.snippet ?? undefined)

      const msg: EmailMessage = {
        id: message.id ?? m.id,
        subject: readHeader('Subject') ?? '(no subject)',
        to: normalizeAddresses(readHeader('To')?.split(',')),
        date: date ?? new Date(),
        mailbox: message.labelIds?.includes('SENT') ? 'sent' : 'inbox',
      }

      if (snippet) {
        msg.snippet = snippet
      }

      const from = pickAddress(readHeader('From'))
      if (from) {
        msg.from = from
      }

      if (this.isWithinRange(msg.date, start, end) && this.matchesFilters(msg)) {
        messages.push(msg)
      }
    }

    return messages.sort((a, b) => a.date.getTime() - b.date.getTime())
  }
}
