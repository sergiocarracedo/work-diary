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
# Run the workflow (fetch → summarize → publish)
pnpm diary

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

## GitHub Action releases

- `dist/` stays ignored on main; only release tags carry the built CLI.
- Create a GitHub Release with tag `vX.Y.Z` (or run the `Bundle Action Release` workflow with a tag); CI builds with Vite, uploads artifacts, and force-updates the tag to a dist-only commit.
- Consumers should reference the tag (e.g., `uses: owner/repo@vX.Y.Z`) to get `action.yml` plus the bundled CLI without installing pnpm or dependencies.

## Security checks

- Pre-commit hooks run `git-secrets --scan` on staged files. Install git-secrets (https://github.com/awslabs/git-secrets) and register patterns (e.g., `git secrets --register-aws`) before committing.

## How the CLI works

- The `diary` script runs `src/cli.ts`, which loads `workdiary.config.yaml` (or `--config <file>`) and resolves any `env:VAR_NAME` placeholders against your environment variables.
- It computes the target date (today by default, or `--date YYYY-MM-DD`) and builds a shared context with logging and date formatting.
- Input plugins (GitHub, Slack, Email) run in parallel to fetch raw data and optionally summarize with your configured AI provider.
- The formatter plugin turns the collected summaries into final output content.
- Output plugins (console, file, etc.) write the formatted result to their destinations.
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
