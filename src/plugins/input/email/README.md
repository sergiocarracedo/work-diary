# Email Input Plugin

Fetches the day's sent and received email messages and summarizes them with the configured AI provider. Supports IMAP, POP3, and the Gmail API. Optional `from`/`to` filters let you narrow which correspondents are included.

## Configuration

All variants support optional address filters:

- `from` (string[], optional) — Only include messages whose sender matches one of these addresses.
- `to` (string[], optional) — Only include messages where any recipient matches one of these addresses.

### IMAP

- `provider` — `imap`
- `host` (string, required)
- `port` (number, required)
- `secure` (boolean, default `true`) — Use TLS.
- `user` / `password` (string, required)
- `mailbox` (string, default `INBOX`) — Inbox folder name.
- `sentMailbox` (string, default `Sent`) — Sent folder name.
- `maxMessages` (number, default `200`) — Max messages to pull across inbox+sent.

**Mailbox naming tips (IMAP)**

- Folder names must match your provider exactly (including casing/spaces). Common sent names: `Sent`, `Sent Items`, `INBOX.Sent`, `[Gmail]/Sent Mail`.
- Gmail IMAP: enable IMAP in Gmail, use an App Password with 2FA, and typically set `mailbox: "[Gmail]/All Mail"` and `sentMailbox: "[Gmail]/Sent Mail"`. If you use `All Mail`, you may get both inbox and sent in one folder—set `sentMailbox` to a non-sent folder (or leave the default) if you want to avoid double-counting sent items.
- If a folder is missing, the plugin now warns and skips it; update `sentMailbox`/`mailbox` to the correct names to include it.

### POP3

- `provider` — `pop3`
- `host` (string, required)
- `port` (number, required)
- `tls` (boolean, default `true`)
- `user` / `password` (string, required)
- `maxMessages` (number, default `200`) — Max latest messages to pull.

### Gmail API

- `provider` — `gmail`
- `clientId` (string, required)
- `clientSecret` (string, required)
- `refreshToken` (string, required) — Long-lived refresh token; an access token can also be provided.
- `accessToken` (string, optional) — Used if present; refreshed if expired.
- `userId` (string, default `me`) — Gmail user ID.
- `labelIds` (string[], default `['INBOX', 'SENT']`) — Labels to include.
- `maxMessages` (number, default `200`)

## Examples

### IMAP

```yaml
inputs:
  - plugin: email
    config:
      provider: imap
      host: imap.example.com
      port: 993
      secure: true
      user: env:IMAP_USER
      password: env:IMAP_PASSWORD
      from: ['teammate@example.com']
```

### POP3

```yaml
inputs:
  - plugin: email
    config:
      provider: pop3
      host: pop.example.com
      port: 995
      tls: true
      user: env:POP3_USER
      password: env:POP3_PASSWORD
      to: ['me@example.com']
```

### Gmail API

```yaml
inputs:
  - plugin: email
    config:
      provider: gmail
      clientId: env:GMAIL_CLIENT_ID
      clientSecret: env:GMAIL_CLIENT_SECRET
      refreshToken: env:GMAIL_REFRESH_TOKEN
      accessToken: env:GMAIL_ACCESS_TOKEN # optional
      labelIds: ['INBOX', 'SENT']
      from: ['partner@example.com']
```

Behavior:

- Pulls messages within the diary date (00:00–23:59, local time).
- Summarizes both inbox and sent mail; stats are appended to the AI summary.
- `from`/`to` filters narrow which messages are summarized.
