import { GitHubActivity } from "./types"

export const buildPrompt = (data: GitHubActivity): string => {
    const sections: string[] = []

    sections.push(
      `You are a helpful assistant that summarizes a developer's daily work based on their GitHub activity.`,
    )
    sections.push(`\nDate: ${data.date}`)
    sections.push(`User: ${data.username}`)

    if (data.commits.length > 0) {
      sections.push(`\n## Commits (${data.commits.length})\n`)
      for (const commit of data.commits) {
        sections.push(`- [${commit.repo}] ${commit.message}`)
        if (commit.diff) {
          sections.push(
            `\n  Diff:\n\`\`\`diff\n${commit.diff.substring(0, 1000)}${commit.diff.length > 1000 ? '\n... (diff truncated)' : ''}\n\`\`\`\n`,
          )
        }
      }
    }

    if (data.pullRequests.length > 0) {
      sections.push(`\n## Pull Requests (${data.pullRequests.length})\n`)
      for (const pr of data.pullRequests) {
        sections.push(`- [${pr.repo}] #${pr.number}: ${pr.title} (${pr.state})`)
        if (pr.body) {
          sections.push(
            `  Description: ${pr.body.substring(0, 200)}${pr.body.length > 200 ? '...' : ''}`,
          )
        }
      }
    }

    if (data.issues.length > 0) {
      sections.push(`\n## Issues (${data.issues.length})\n`)
      for (const issue of data.issues) {
        sections.push(`- [${issue.repo}] #${issue.number}: ${issue.title} (${issue.state})`)
        if (issue.body) {
          sections.push(
            `  Description: ${issue.body.substring(0, 200)}${issue.body.length > 200 ? '...' : ''}`,
          )
        }
      }
    }

    if (data.reviews.length > 0) {
      sections.push(`\n## Reviews (${data.reviews.length})\n`)
      for (const review of data.reviews) {
        sections.push(`- [${review.repo}] #${review.pullNumber}: review ${review.state}`)
        if (review.body) {
          sections.push(
            `  Comments: ${review.body.substring(0, 200)}${review.body.length > 200 ? '...' : ''}`,
          )
        }
      }
    }

    if (data.repoCreations.length > 0) {
      sections.push(`\n## New Repositories Created (${data.repoCreations.length})\n`)
      for (const repo of data.repoCreations) {
        const privacy = repo.isPrivate ? '🔒 Private' : '🌐 Public'
        sections.push(`- ${repo.name} (${privacy})`)
        if (repo.description) {
          sections.push(`  Description: ${repo.description}`)
        }
      }
    }

    sections.push(`\n## Instructions`)
    sections.push(`Write a concise, professional summary of the work done today. Focus on:`)
    sections.push(`1. Main accomplishments and features worked on`)
    sections.push(`2. Problems solved or bugs fixed`)
    sections.push(`3. Any notable patterns or themes in the work`)
    sections.push(`4. Technologies and repositories involved`)
    sections.push(
      `\nWrite in first person ("I worked on..."), keep it concise (2-4 paragraphs), and maintain a professional yet friendly tone.`,
    )

    if (
      data.commits.length === 0 &&
      data.pullRequests.length === 0 &&
      data.repoCreations.length === 0  &&
      data.issues.length === 0 &&
        data.reviews.length === 0 &&
        data.comments.length === 0
    ) {
      sections.push(`\nNote: No activity was found for this day. Mention this in the summary.`)
    }

    return sections.join('\n')
}