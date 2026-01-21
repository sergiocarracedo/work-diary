# Work Diary

Generate a daily work log from your GitHub activity using AI. Available as a prebuilt GitHub Action and a local TypeScript CLI.

## Features

- Fetch Your daily activity, summarize with AI (OpenAI, Anthropic, Google), and outputs it to a file, console, for example to obsidian
- Pluggable inputs/outputs (GitHub, email, Slack → Markdown → console/file)

## Available plugins

- Inputs:
  - [Github](src/plugins/input/github/README.md)
  - [Email](src/plugins/input/email/README.md)
  - [Slack](src/plugins/input/slack/README.md)
- Formatter:
  - [Markdown](src/plugins/formatter/markdown/README.md)
- Outputs:
  - [Console](src/plugins/output/console/README.md)
  - [File](src/plugins/output/file/README.md)

## Use as a GitHub Action

- Action ref: use a release tag (e.g., sergiocarracedo/workdiary@v1.0.0). Release tags contain only action.yml and dist/; dist/ stays ignored on main.
- Config source: provide either a config file path (config-path, default workdiary.config.yaml) or inline YAML via config. The action fails if neither is provided or the path is unreadable.
- Inputs
  - config-path: string, default workdiary.config.yaml
  - config: string, YAML; overrides config-path
  - date: YYYY-MM-DD; defaults to today (UTC) when empty
  - working-directory: string, default .
  - node-version: string, default 20

## Minimal config example

```yaml
ai:
 provider: openai
 apiKey: env:OPENAI_API_KEY
 model: gpt-4o-mini

inputs:
 - plugin: github
  config:
   token: env:GH_TOKEN
   username: env:GH_USERNAME

formatter:
 plugin: markdown

outputs:
 - plugin: file
  config:
   path: 'obsidian/Daily Notes/{date}.md'
```

## Github Actions Workflow example

```yaml
name: Daily Work Diary
on:
 schedule:
  - cron: '15 7 * * *' # daily at 07:15 UTC
 workflow_dispatch:

jobs:
 diary:
  runs-on: ubuntu-latest
  steps:
   - uses: actions/checkout@v4
   - name: Work Diary
    uses: sergiocarracedo/workdiary@v1.0.0
    with:
     config-path: workdiary.config.yaml
     date: '' # optional; empty defaults to today UTC
    env:
     OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
     GH_TOKEN: ${{ secrets.GH_TOKEN }}
     GH_USERNAME: ${{ secrets.GH_USERNAME }}
```

License
MIT
