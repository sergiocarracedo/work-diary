# Setup Guide

Plugin-based workflow: pick an AI provider, plug in inputs, formatters, and outputs. This guide matches the README defaults: OpenAI provider, GitHub input, Markdown formatter, and file output targeting an Obsidian vault path.

## Prerequisites

- Node.js 20+
- pnpm 10+
- Git
- GitHub PAT with `repo` and `read:user`
- AI key (OpenAI default; Anthropic optional)
- Path to your Obsidian vault for saving notes

## Install

```bash
pnpm install
```

## Environment

- `.env` is auto-loaded; YAML supports `env:VARNAME` placeholders.
- Recommended `.env` template:

```bash
cat > .env <<'EOF'
GH_TOKEN=ghp_your_token
GH_USERNAME=your_github_username
AI_PROVIDER=openai
OPENAI_API_KEY=your_openai_key
# Optional: ANTHROPIC_API_KEY=your_anthropic_key
OBSIDIAN_VAULT_PATH="/path/to/Obsidian Vault/Work Diary"
EOF
```

Key variables:

- GH_TOKEN / GH_USERNAME: GitHub PAT and username for activity fetches
- AI_PROVIDER: `openai` (default) or `anthropic`
- OPENAI_API_KEY / ANTHROPIC_API_KEY: match the chosen provider
- OBSIDIAN_VAULT_PATH: folder where diary files will be written

## Configure `workdiary.config.yaml`

Example aligned with README defaults:

```yaml
ai:
  provider: openai
  apiKey: env:OPENAI_API_KEY
  # model: gpt-4o           # optional; set if you want a specific model

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
      path: '${OBSIDIAN_VAULT_PATH}/{date}.md'
      # {date} is replaced with the diary date (YYYY-MM-DD)
```

Notes:

- The repo ships a sample config that uses Google Gemini with console+file outputs; switch `ai.provider`/`apiKey`/`model` if you prefer that setup.
- Update the `path` to point at your vault; you can include subfolders like `.../Work Diary/{date}.md`.

## Run the CLI

```bash
pnpm diary                   # run full workflow for today
pnpm diary --date 2026-01-18 # run for a specific date (YYYY-MM-DD)
pnpm diary fetch             # fetch activity only
pnpm diary summarize         # summarize fetched activity
pnpm diary publish           # publish/output summaries
```

## Development

```bash
pnpm test
pnpm test:watch
pnpm build
pnpm lint
pnpm format
```

## Git hooks

- Hooks install via `pnpm prepare`.
- pre-commit: oxlint, oxfmt --check, tsc --noEmit
- commit-msg: commitlint (config-conventional)

## VS Code

- Install `oxc.oxc-vscode` for oxlint/oxfmt support.
- Enable format on save; prefer workspace TypeScript when prompted.

## Project structure

````
.
├─ commitlint.config.js
├─ lefthook.yml
├─ oxfmt.json
├─ package.json
├─ pnpm-lock.yaml
├─ README.md
├─ SETUP.md
├─ tsconfig.json
├─ vite.config.ts
├─ vitest.config.ts
├─ workdiary.config.yaml
└─ src/
   ├─ cli.ts
   ├─ plugins/
   │  ├─ autoload.ts
   │  ├─ formatter/
   │  │  └─ markdown/
   │  │     ├─ index.ts
   │  │     └─ README.md
   │  ├─ input/
   │  │  └─ github/
   │  │     ├─ index.ts
   │  │     ├─ README.md
   │  │     ├─ service.ts
   │  │     ├─ tools.ts
   │  │     └─ types.ts
   │  └─ output/
   │     ├─ console/
   │     │  ├─ index.ts
   │     │  └─ README.md
   │     └─ file/
   │        ├─ index.ts
   │        └─ README.md
   ├─ services/
   │  └─ ai.ts
   ├─ types/
   │  ├─ ai-summarizer.ts
   │  ├─ ambient.d.ts
   │  ├─ config.ts
   │  ├─ index.ts
   │  ├─ logger.ts
   │  └─ plugins.ts
   ├─ utils/
   │  ├─ date.ts
   │  ├─ logger.ts
   │  └─ markers.ts
   └─ workflows/
      ├─ run.ts
      └─ schema.ts
```
````

```

```
