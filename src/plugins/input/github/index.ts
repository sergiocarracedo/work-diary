import { createPluginConfigParser } from '@/plugins/config'
import { GitHubService } from '@/plugins/input/github/service'
import { Plugin, PluginRetrieveContext } from '@/types/plugins'
import { z } from 'zod/v4'
import { buildPrompt } from './tools'

const features = ['commits', 'pullRequests', 'issues', 'reviews', 'comments'] as const
const featureEnum = z.enum(features)

const gitGithubConfigSchema = z.object({
  username: z
    .string()
    .min(1, 'username is required')
    .describe('GitHub username to fetch activity for'),
  token: z.string().min(1, 'token is required').describe('GitHub personal access token'),
  include: z.array(z.string()).optional().describe('List of repos to include in the summary'),
  exclude: z.array(z.string()).optional().describe('List of repos to exclude from the summary'),
  // The features to include in the summary (default: all)
  features: z
    .array(featureEnum)
    .default([...features])
    .describe('The features to include in the summary'),
})

export type GitHubConfig = z.infer<typeof gitGithubConfigSchema>

const GitHubInputPlugin: Plugin<typeof gitGithubConfigSchema> = {
  name: 'github',
  configSchema: gitGithubConfigSchema,
  parseConfig: createPluginConfigParser('github', gitGithubConfigSchema),
  description: 'Fetches your daily data (commits, PRs, etc) from a GitHub and creates a summary',
  retrieve: async (ctx: PluginRetrieveContext, config: GitHubConfig) => {
    const githubService = new GitHubService(config, ctx.logger)

    const rawData = await githubService.fetchDayActivity(
      ctx.date,
      config.features,
      config.include ?? [],
      config.exclude ?? [],
    )

    const prompt = buildPrompt(rawData)

    const activityEvents = Object.values(rawData).flat().length
    let summary = ''
    if (activityEvents === 0) {
      ctx.logger.info('No GitHub activity found for the specified date.')
    } else {
      ctx.logger.info(`Generating GitHub activity summary with ${activityEvents} events.`)
      const aiSummary = await ctx.aiSummarizer(prompt)
      ctx.logger.debug(`GitHub AI Summary: ${aiSummary}`)
      summary += aiSummary
    }
    const stats = []
    stats.push(`Commits: ${rawData.commits.length}`)
    stats.push(`PRs: ${rawData.pullRequests.length}`)
    stats.push(`Issues: ${rawData.issues.length}`)
    stats.push(`Reviews: ${rawData.reviews.length}`)
    stats.push(`Comments: ${rawData.comments.length}`)
    stats.push(`New Repos: ${rawData.repoCreations.length}`)

    return {
      pluginName: 'GitHub',
      summary: activityEvents ? summary + `\n\n- ${stats.join('\n- ')}` : 'No activity recorded.',
      metadata: {
        comments: rawData.comments,
        commits: rawData.commits,
        issues: rawData.issues,
        pullRequests: rawData.pullRequests,
        repoCreations: rawData.repoCreations,
        reviews: rawData.reviews,
      },
    }
  },
}

export default GitHubInputPlugin
