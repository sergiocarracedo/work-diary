# Work Diary

A TypeScript CLI tool that automatically generates daily work summaries from GitHub commits and PRs using AI.

## Features

- 📊 Fetch commits and PRs from GitHub for a specific user and date
- 🤖 Generate AI-powered summaries using LLMs (OpenAI, Anthropic)
- 📝 Save summaries to your Obsidian vault
- 🔄 Modular execution (fetch, summarize, publish steps)
- ⚡ Built with modern TypeScript tooling (Vite, pnpm)
- 🤖 Automated daily execution via GitHub Actions

## Installation

```bash
pnpm install
```

## Configuration

Create a `.env` file:

```bash
# GitHub Configuration
GH_TOKEN=your_github_token
GH_USERNAME=your_username

# AI Configuration (choose one or more)
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
AI_PROVIDER=openai  # or anthropic

# Obsidian Configuration
OBSIDIAN_VAULT_PATH=/path/to/your/vault
```

## Usage

```bash
# Run all steps (fetch, summarize, publish)
pnpm diary

# Run individual steps
pnpm diary fetch
pnpm diary summarize
pnpm diary publish

# Specify date (defaults to today)
pnpm diary --date 2026-01-13
```

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Build
pnpm build

# Lint
pnpm lint

# Format
pnpm format
```

## Tech Stack

- **Language**: TypeScript 5.7+
- **Package Manager**: pnpm 10+
- **Build Tool**: Vite 6+
- **Testing**: Vitest 3+
- **Linter**: oxlint (oxc)
- **Formatter**: oxfmt (oxc)
- **Git Hooks**: lefthook
- **Commit Linting**: commitlint

## License

MIT
