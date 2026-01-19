import type { Logger } from '@/types'
import { getDateRange } from '@/utils/date'
import { Octokit } from '@octokit/rest'
import type {
  GitHubActivity,
  GitHubComment,
  GitHubCommit,
  GitHubIssue,
  GitHubPR,
  GitHubRepoCreation,
  GitHubReview,
} from './types'

const gitHubFeatures = [
  'commits',
  'pullRequests',
  'issues',
  'reviews',
  'comments',
  'repoCreations',
] as const

type GitHubFeature = (typeof gitHubFeatures)[number]

export class GitHubService {
  private octokit: Octokit
  private logger: Logger
  private config: { token: string; username: string }

  constructor(config: { token: string; username: string }, logger: Logger) {
    this.config = config
    const token = config.token
    if (!token) {
      throw new Error('GitHub token is required')
    }
    this.octokit = new Octokit({
      auth: token,
    })
    this.logger = logger
  }

  async fetchDayActivity(
    date: Date,
    features: Iterable<GitHubFeature> = gitHubFeatures,
    includeRepos: string[] = [],
    excludeRepos: string[] = [],
  ): Promise<GitHubActivity> {
    // First verify connection and get the actual username from token
    const { data: user } = await this.octokit.users.getAuthenticated()
    const actualUsername = this.config.username || user.login

    this.logger.info(
      `Fetching GitHub activity for ${actualUsername} on ${date.toISOString().split('T')[0]}`,
    )

    const { start, end } = getDateRange(date)

    const enabled = new Set(features ?? gitHubFeatures)

    const [commits, pullRequests, repoCreations, issues, reviews, comments] = await Promise.all([
      enabled.has('commits')
        ? this.fetchCommits(actualUsername, start, end, includeRepos, excludeRepos)
        : Promise.resolve([] as GitHubCommit[]),
      enabled.has('pullRequests')
        ? this.fetchPullRequests(actualUsername, start, end, includeRepos, excludeRepos)
        : Promise.resolve([] as GitHubPR[]),
      enabled.has('repoCreations')
        ? this.fetchRepoCreations(actualUsername, start, end, includeRepos, excludeRepos)
        : Promise.resolve([] as GitHubRepoCreation[]),
      enabled.has('issues')
        ? this.fetchIssues(actualUsername, start, end, includeRepos, excludeRepos)
        : Promise.resolve([] as GitHubIssue[]),
      enabled.has('reviews')
        ? this.fetchReviews(actualUsername, start, end, includeRepos, excludeRepos)
        : Promise.resolve([] as GitHubReview[]),
      enabled.has('comments')
        ? this.fetchComments(actualUsername, start, end, includeRepos, excludeRepos)
        : Promise.resolve([] as GitHubComment[]),
    ])

    return {
      date: date.toISOString().split('T')[0] ?? '',
      username: actualUsername,
      commits,
      pullRequests,
      issues,
      reviews,
      comments,
      repoCreations,
      fetchedAt: new Date().toISOString(),
    }
  }

  private async fetchCommits(
    username: string,
    start: Date,
    end: Date,
    includeRepos: string[],
    excludeRepos: string[],
  ): Promise<GitHubCommit[]> {
    try {
      // Fetch user's events to find which repos they pushed to
      const { data: events } = await this.octokit.request('GET /users/{username}/events', {
        username,
        per_page: 100,
      })

      const commits: GitHubCommit[] = []
      const processedRepos = new Set<string>()

      // Find all repos with PushEvents in the date range
      for (const event of events) {
        if (event.type === 'PushEvent' && event.repo?.name) {
          const createdAt = event.created_at ?? new Date().toISOString()
          const eventDate = new Date(createdAt)

          if (eventDate >= start && eventDate <= end) {
            const repoName = event.repo.name

            if (!this.isRepoAllowed(repoName, includeRepos, excludeRepos)) {
              continue
            }

            // Skip if we've already processed this repo
            if (processedRepos.has(repoName)) {
              continue
            }
            processedRepos.add(repoName)

            try {
              // Fetch commits for this repo in the date range
              const [owner, repo] = repoName.split('/')
              if (!owner || !repo) continue

              const { data: repoCommits } = await this.octokit.request(
                'GET /repos/{owner}/{repo}/commits',
                {
                  owner,
                  repo,
                  author: username,
                  since: start.toISOString(),
                  until: end.toISOString(),
                  per_page: 100,
                },
              )

              for (const commit of repoCommits) {
                // Fetch commit diff
                let diff: string | undefined
                try {
                  const { data: commitDetails } = await this.octokit.request(
                    'GET /repos/{owner}/{repo}/commits/{ref}',
                    {
                      owner,
                      repo,
                      ref: commit.sha,
                    },
                  )

                  // Extract and format the diff from files
                  if (commitDetails.files && commitDetails.files.length > 0) {
                    diff = commitDetails.files
                      .map((file) => {
                        const patch = file.patch || ''
                        return `--- ${file.filename}\n${patch}`
                      })
                      .join('\n\n')
                  }
                } catch (error) {
                  this.logger.warn(`Failed to fetch diff for commit ${commit.sha}: ${error}`)
                }

                const commitData: GitHubCommit = {
                  sha: commit.sha,
                  message: commit.commit.message,
                  author: commit.commit.author?.name ?? username,
                  date: commit.commit.author?.date ?? createdAt,
                  repo: repoName,
                  url: commit.html_url,
                }

                if (diff) {
                  commitData.diff = diff
                }

                commits.push(commitData)
              }
            } catch (error) {
              this.logger.warn(`Failed to fetch commits for ${repoName}: ${error}`)
            }
          }
        }
      }

      this.logger.success(`Found ${commits.length} commits`)
      return commits
    } catch (error) {
      this.logger.error(`Failed to fetch commits: ${error}`)
      throw error
    }
  }

  private async fetchPullRequests(
    username: string,
    start: Date,
    end: Date,
    includeRepos: string[],
    excludeRepos: string[],
  ): Promise<GitHubPR[]> {
    try {
      // Search for PRs created by the user
      const query = `author:${username} type:pr created:${start.toISOString().split('T')[0]}..${end.toISOString().split('T')[0]}`

      const { data } = await this.octokit.request('GET /search/issues', {
        q: query,
        per_page: 100,
        sort: 'created',
        order: 'desc',
      })

      const pullRequests: GitHubPR[] = data.items
        .map((item) => {
          const repo = item.repository_url.split('/').slice(-2).join('/')

          if (!this.isRepoAllowed(repo, includeRepos, excludeRepos)) {
            return null
          }

          const pr: GitHubPR = {
            number: item.number,
            title: item.title,
            state: item.state,
            repo,
            url: item.html_url,
            createdAt: item.created_at,
          }

          if (item.pull_request?.merged_at) {
            pr.mergedAt = item.pull_request.merged_at
          }

          if (item.closed_at) {
            pr.closedAt = item.closed_at
          }

          if (item.body) {
            pr.body = item.body
          }

          return pr
        })
        .filter(Boolean) as GitHubPR[]

      this.logger.success(`Found ${pullRequests.length} pull requests`)
      return pullRequests
    } catch (error) {
      this.logger.error(`Failed to fetch pull requests: ${error}`)
      throw error
    }
  }

  private async fetchIssues(
    username: string,
    start: Date,
    end: Date,
    includeRepos: string[],
    excludeRepos: string[],
  ): Promise<GitHubIssue[]> {
    try {
      const query = `author:${username} type:issue created:${start.toISOString().split('T')[0]}..${
        end.toISOString().split('T')[0]
      }`

      const { data } = await this.octokit.request('GET /search/issues', {
        q: query,
        per_page: 100,
        sort: 'created',
        order: 'desc',
      })

      const issues: GitHubIssue[] = data.items
        .map((item) => {
          const repo = item.repository_url.split('/').slice(-2).join('/')

          if (!this.isRepoAllowed(repo, includeRepos, excludeRepos)) {
            return null
          }

          const issue: GitHubIssue = {
            number: item.number,
            title: item.title,
            state: item.state,
            repo,
            url: item.html_url,
            createdAt: item.created_at,
          }

          if (item.closed_at) {
            issue.closedAt = item.closed_at
          }

          if (item.body) {
            issue.body = item.body
          }

          return issue
        })
        .filter(Boolean) as GitHubIssue[]

      this.logger.success(`Found ${issues.length} issues`)
      return issues
    } catch (error) {
      this.logger.error(`Failed to fetch issues: ${error}`)
      throw error
    }
  }

  private async fetchReviews(
    username: string,
    start: Date,
    end: Date,
    includeRepos: string[],
    excludeRepos: string[],
  ): Promise<GitHubReview[]> {
    const reviews: GitHubReview[] = []

    try {
      const query = `reviewed-by:${username} type:pr updated:${
        start.toISOString().split('T')[0]
      }..${end.toISOString().split('T')[0]}`

      const { data } = await this.octokit.request('GET /search/issues', {
        q: query,
        per_page: 50,
        sort: 'updated',
        order: 'desc',
      })

      for (const item of data.items) {
        const [owner, repo] = item.repository_url.split('/').slice(-2)
        if (!owner || !repo) continue

        const fullName = `${owner}/${repo}`
        if (!this.isRepoAllowed(fullName, includeRepos, excludeRepos)) continue

        try {
          const { data: prReviews } = await this.octokit.request(
            'GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews',
            {
              owner,
              repo,
              pull_number: item.number,
              per_page: 100,
            },
          )

          for (const review of prReviews) {
            if (review.user?.login !== username) continue
            const submittedAt = review.submitted_at
            if (!submittedAt) continue
            const submittedDate = new Date(submittedAt)
            if (submittedDate < start || submittedDate > end) continue

            reviews.push({
              repo: `${owner}/${repo}`,
              pullNumber: item.number,
              state: review.state ?? 'COMMENTED',
              submittedAt,
              url: review.html_url ?? review._links?.html?.href ?? item.html_url,
              body: review.body ?? undefined,
            })
          }
        } catch (error) {
          this.logger.warn(`Failed to fetch reviews for ${repo}#${item.number}: ${error}`)
        }
      }

      this.logger.success(`Found ${reviews.length} reviews`)
      return reviews
    } catch (error) {
      this.logger.error(`Failed to fetch reviews: ${error}`)
      throw error
    }
  }

  private async fetchComments(
    username: string,
    start: Date,
    end: Date,
    includeRepos: string[],
    excludeRepos: string[],
  ): Promise<GitHubComment[]> {
    const comments: GitHubComment[] = []

    try {
      const query = `commenter:${username} type:issue updated:${
        start.toISOString().split('T')[0]
      }..${end.toISOString().split('T')[0]}`

      const { data } = await this.octokit.request('GET /search/issues', {
        q: query,
        per_page: 50,
        sort: 'updated',
        order: 'desc',
      })

      for (const item of data.items) {
        const [owner, repo] = item.repository_url.split('/').slice(-2)
        if (!owner || !repo) continue

        const fullName = `${owner}/${repo}`
        if (!this.isRepoAllowed(fullName, includeRepos, excludeRepos)) continue

        try {
          const { data: issueComments } = await this.octokit.request(
            'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
            {
              owner,
              repo,
              issue_number: item.number,
              per_page: 100,
            },
          )

          for (const comment of issueComments) {
            if (comment.user?.login !== username) continue
            const createdAt = comment.created_at
            if (!createdAt) continue
            const createdDate = new Date(createdAt)
            if (createdDate < start || createdDate > end) continue

            comments.push({
              repo: `${owner}/${repo}`,
              issueNumber: item.number,
              url: comment.html_url,
              body: comment.body ?? '',
              createdAt,
              type: item.pull_request ? 'pr' : 'issue',
            })
          }
        } catch (error) {
          this.logger.warn(`Failed to fetch comments for ${owner}/${repo}#${item.number}: ${error}`)
        }
      }

      this.logger.success(`Found ${comments.length} comments`)
      return comments
    } catch (error) {
      this.logger.error(`Failed to fetch comments: ${error}`)
      throw error
    }
  }

  private async fetchRepoCreations(
    username: string,
    start: Date,
    end: Date,
    includeRepos: string[],
    excludeRepos: string[],
  ): Promise<GitHubRepoCreation[]> {
    try {
      // Fetch user's repositories sorted by creation date
      // Using authenticated endpoint to get both public and private repos
      const { data: repos } = await this.octokit.request('GET /user/repos', {
        per_page: 100,
        sort: 'created',
        direction: 'desc',
      })

      const repoCreations: GitHubRepoCreation[] = []

      for (const repo of repos) {
        const createdAt = repo.created_at
        if (!createdAt) continue

        const createdDate = new Date(createdAt)

        // Only include repos created in the specified date range and owned by the user
        const fullName = repo.full_name
        if (!this.isRepoAllowed(fullName, includeRepos, excludeRepos)) continue

        if (createdDate >= start && createdDate <= end && repo.owner?.login === username) {
          const repoCreation: GitHubRepoCreation = {
            name: repo.full_name,
            isPrivate: repo.private,
            url: repo.html_url,
            createdAt,
          }

          if (repo.description) {
            repoCreation.description = repo.description
          }

          repoCreations.push(repoCreation)
        }
      }

      this.logger.success(`Found ${repoCreations.length} repository creations`)
      return repoCreations
    } catch (error) {
      this.logger.error(`Failed to fetch repository creations: ${error}`)
      throw error
    }
  }

  async verifyConnection(): Promise<boolean> {
    try {
      const { data } = await this.octokit.users.getAuthenticated()
      this.logger.success(`Connected to GitHub as ${data.login}`)
      return true
    } catch (error) {
      this.logger.error(`Failed to connect to GitHub: ${error}`)
      return false
    }
  }

  private isRepoAllowed(repo: string, includeRepos: string[], excludeRepos: string[]): boolean {
    if (excludeRepos.length && excludeRepos.includes(repo)) {
      return false
    }
    if (includeRepos.length && !includeRepos.includes(repo)) {
      return false
    }
    return true
  }
}
