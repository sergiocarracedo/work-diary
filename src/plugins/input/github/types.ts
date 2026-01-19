export interface GitHubCommit {
  sha: string
  message: string
  author: string
  date: string
  repo: string
  url: string
  diff?: string
}

export interface GitHubPR {
  number: number
  title: string
  state: string
  repo: string
  url: string
  createdAt: string
  mergedAt?: string
  closedAt?: string
  body?: string
}

export interface GitHubIssue {
  number: number
  title: string
  state: string
  repo: string
  url: string
  createdAt: string
  closedAt?: string
  body?: string
}

export interface GitHubReview {
  repo: string
  pullNumber: number
  state: string
  submittedAt: string
  url: string
  body?: string
}

export interface GitHubComment {
  repo: string
  issueNumber: number
  url: string
  body: string
  createdAt: string
  type: 'issue' | 'pr'
}

export interface GitHubRepoCreation {
  name: string
  description?: string
  isPrivate: boolean
  url: string
  createdAt: string
}

export interface GitHubActivity {
  date: string
  username: string
  commits: GitHubCommit[]
  pullRequests: GitHubPR[]
  issues: GitHubIssue[]
  reviews: GitHubReview[]
  comments: GitHubComment[]
  repoCreations: GitHubRepoCreation[]
  fetchedAt: string
}
