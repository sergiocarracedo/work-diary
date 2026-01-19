# GitHub Input Plugin

## Description

Fetches your daily GitHub activity (commits, pull requests, issues, reviews, comments) for a user and asks the configured AI provider to generate a short narrative summary. Returns both the AI-written summary and the raw activity metadata.

## Configuration

- `username` (string, required) — GitHub username to pull activity for. Defaults to none; must be provided.
- `token` (string, required) — GitHub personal access token (with `repo`/`read:user` scope as needed). Defaults to none; must be provided.
- `include` (string[], optional) — Repository allowlist (`owner/name`). When set, only these repos are considered. Default: include all.
- `exclude` (string[], optional) — Repository blocklist (`owner/name`). Applied after `include` filtering. Default: exclude none.
- `features` ("commits" | "pullRequests" | "issues" | "reviews" | "comments")[], optional — Which activity types to fetch. Default: all five. Use to skip categories you do not need.

Use `include`/`exclude` to narrow repos, and `features` to reduce API calls when you only need certain event types.

## Basic config

```yaml
inputs:
  - plugin: github
    config:
      username: YOUR_GH_USERNAME
      token: env:GH_READ_TOKEN
      include: ['your-org/important-repo']
      features: ['commits', 'pullRequests', 'issues', 'reviews', 'comments'
```
