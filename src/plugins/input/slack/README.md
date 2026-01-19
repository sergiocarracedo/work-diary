# Slack Input Plugin

Summarizes Slack activity for specific users, including channel messages, optional DMs, threads, and reactions. Only the configured users' messages are summarized; other users appear only as thread context.

## Required scopes

- `channels:history`
- `groups:history`
- `im:history`
- `mpim:history`
- `conversations:history`
- `conversations:read`
- `conversations:replies`
- `reactions:read`
- `users:read`

Use a bot or user token that includes these scopes. Exclusion takes priority if a conversation appears in both include and exclude lists.

## Configuration

- `token` (string, required) — Slack bot/user token with the scopes above.
- `users` (string[], required) — Slack user IDs to summarize. Only these users' messages are included.
- `include` (string[], optional, default `[]`) — Conversation IDs (channels or DMs) to allow. If empty, all conversations of the selected types are allowed.
- `exclude` (string[], optional, default `[]`) — Conversation IDs to skip. If an ID is in both include and exclude, it is excluded.
- `includeDMs` (boolean, optional, default `false`) — When `true`, DMs and multi-person DMs are fetched in addition to channels.
- `maxChannels` (number, optional, default `50`) — Maximum conversations to scan.
- `maxMessagesPerChannel` (number, optional, default `400`) — Maximum messages fetched per conversation in the date window.

## Example

```yaml
inputs:
  - plugin: slack
    config:
      token: env:SLACK_BOT_TOKEN
      users: ['U123ABC', 'U234DEF']
      includeDMs: true
      include: ['C345GHI', 'D456JKL']
      exclude: ['C789MNO']
      maxChannels: 40
      maxMessagesPerChannel: 300
```

Behavior:

- Defaults to channels only; set `includeDMs: true` to read DMs/group DMs.
- Only messages (including thread replies) from the `users` list are summarized.
- Threads and reactions on those users' messages are included in the prompt and stats.
- `exclude` wins when an ID is present in both include and exclude.
