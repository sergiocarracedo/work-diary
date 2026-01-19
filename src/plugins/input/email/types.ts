export type ImapEmailConfig = {
  provider: 'imap'
  host: string
  port: number
  secure: boolean
  user: string
  password: string
  mailbox: string
  sentMailbox: string
  maxMessages: number
  from?: string[] | undefined
  to?: string[] | undefined
}

export type Pop3EmailConfig = {
  provider: 'pop3'
  host: string
  port: number
  tls: boolean
  user: string
  password: string
  maxMessages: number
  from?: string[] | undefined
  to?: string[] | undefined
}

export type GmailEmailConfig = {
  provider: 'gmail'
  clientId: string
  clientSecret: string
  refreshToken: string
  accessToken?: string | undefined
  userId: string
  labelIds: string[]
  maxMessages: number
  from?: string[] | undefined
  to?: string[] | undefined
}

export type EmailConfig = ImapEmailConfig | Pop3EmailConfig | GmailEmailConfig

export type EmailMessage = {
  id: string
  subject: string
  from?: string
  to: string[]
  date: Date
  mailbox: 'inbox' | 'sent'
  snippet?: string
}
