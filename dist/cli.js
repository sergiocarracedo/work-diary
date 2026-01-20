#!/usr/bin/env node
import chalk from "chalk";
import { Command } from "commander";
import dotenv from "dotenv";
import path from "node:path";
import process$1 from "node:process";
import { ZodError, z } from "zod/v4";
import { google } from "googleapis";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import Pop3Command from "node-pop3";
import crypto from "node:crypto";
import { Octokit } from "@octokit/rest";
import fs from "node:fs/promises";
import os from "node:os";
import { anthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
const logger = {
  info: (message) => {
    console.log(chalk.blue("ℹ"), message);
  },
  success: (message) => {
    console.log(chalk.green("✔"), message);
  },
  error: (message) => {
    console.error(chalk.red("✖"), message);
  },
  warn: (message) => {
    console.warn(chalk.yellow("⚠"), message);
  },
  debug: (message) => {
    if (process.env.DEBUG) {
      console.log(chalk.gray("🐛"), message);
    }
  }
};
const formatIssuePath = (path2) => {
  if (path2.length === 0) {
    return "<root>";
  }
  return path2.map((segment) => segment.toString()).join(".");
};
const buildErrorMessage = (pluginName, error) => {
  const issueLines = error.issues.map(
    (issue) => `- ${formatIssuePath(issue.path.filter((p) => typeof p !== "symbol"))}: ${issue.message}`
  );
  return [
    `Invalid configuration for plugin "${pluginName}".`,
    "Please fix the following issues:",
    ...issueLines
  ].join("\n");
};
const createPluginConfigParser = (pluginName, schema) => {
  return (rawConfig) => {
    try {
      return schema.parse(rawConfig ?? {});
    } catch (error) {
      if (error instanceof ZodError) {
        throw new Error(buildErrorMessage(pluginName, error));
      }
      if (error instanceof Error) {
        throw new Error(`Invalid configuration for plugin "${pluginName}": ${error.message}`);
      }
      throw new Error(`Invalid configuration for plugin "${pluginName}".`);
    }
  };
};
const __vite_glob_0_0 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  createPluginConfigParser
}, Symbol.toStringTag, { value: "Module" }));
const DEFAULT_START_MARKER = "<!-- workdiary:start -->";
const DEFAULT_END_MARKER = "<!-- workdiary:end -->";
const markdownConfigSchema = z.object({});
const MarkdownPlugin = {
  name: "markdown",
  configSchema: markdownConfigSchema,
  parseConfig: createPluginConfigParser("markdown", markdownConfigSchema),
  description: "Converts the daily summary into Markdown format.",
  format: async (ctx, summaries) => {
    const lines = [];
    lines.push("---");
    lines.push(`date: ${ctx.date.toISOString().split("T")[0]}`);
    lines.push(`generated_at: ${(/* @__PURE__ */ new Date()).toISOString()}`);
    lines.push("type: workdiary");
    lines.push("---");
    lines.push("");
    lines.push(DEFAULT_START_MARKER);
    lines.push("");
    lines.push(`# Daily Summary for ${ctx.date.toDateString()}`);
    lines.push("");
    const sections = summaries.map((s) => {
      const section = [];
      section.push("## Summary from " + s.pluginName);
      if (s.summary) {
        section.push(s.summary);
      }
      return section.join("\n");
    }).join("\n\n---\n\n");
    lines.push(sections);
    lines.push("");
    lines.push(DEFAULT_END_MARKER);
    return {
      content: lines.join("\n")
    };
  }
};
const __vite_glob_0_1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: MarkdownPlugin
}, Symbol.toStringTag, { value: "Module" }));
function formatDate(date, format = "YYYY-MM-DD") {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return format.replace("YYYY", String(year)).replace("MM", month).replace("DD", day);
}
function getDateRange(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}
const normalizeAddresses = (addresses) => {
  return (addresses ?? []).map((addr) => addr.trim().toLowerCase()).filter(Boolean);
};
const pickAddress = (input) => {
  if (!input) return void 0;
  const cleaned = input.trim();
  if (!cleaned) return void 0;
  return cleaned;
};
const pickAddressesFromList = (list) => {
  return (list ?? []).map((item) => item.address?.trim()).filter((addr) => Boolean(addr));
};
const extractEmailAddresses = (addresses) => {
  if (!addresses) return [];
  const list = Array.isArray(addresses) ? addresses : [addresses];
  return list.flatMap((entry) => entry.value ?? []);
};
const extractSnippet = (text, limit = 240) => {
  if (!text) return void 0;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return void 0;
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
};
class EmailService {
  constructor(config, logger2) {
    this.config = config;
    this.logger = logger2;
  }
  async fetchDay(date) {
    const { start, end } = getDateRange(date);
    if (this.config.provider === "imap") {
      return this.fetchImap(this.config, start, end);
    }
    if (this.config.provider === "pop3") {
      return this.fetchPop3(this.config, start, end);
    }
    return this.fetchGmail(this.config, start, end);
  }
  isWithinRange(date, start, end) {
    if (!date || Number.isNaN(date.getTime())) return false;
    return date >= start && date <= end;
  }
  matchesFilters(message) {
    const fromFilters = normalizeAddresses(this.config.from);
    const toFilters = normalizeAddresses(this.config.to);
    const fromOk = fromFilters.length === 0 || (message.from ? fromFilters.includes(message.from.toLowerCase()) : false);
    const toOk = toFilters.length === 0 || message.to.some((addr) => {
      return toFilters.includes(addr.toLowerCase());
    });
    return fromOk && toOk;
  }
  toEmailMessage(parsed, mailbox, fallbackId) {
    const fromAddress = pickAddressesFromList(extractEmailAddresses(parsed.from))[0];
    const toAddresses = pickAddressesFromList(extractEmailAddresses(parsed.to));
    const from = pickAddress(fromAddress);
    const snippet = extractSnippet(parsed.text ?? parsed.textAsHtml);
    const msg = {
      id: parsed.messageId || fallbackId,
      subject: parsed.subject || "(no subject)",
      to: toAddresses,
      date: parsed.date ?? /* @__PURE__ */ new Date(),
      mailbox
    };
    if (snippet) {
      msg.snippet = snippet;
    }
    if (from) {
      msg.from = from;
    }
    return msg;
  }
  async fetchImap(config, start, end) {
    const client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.password
      }
    });
    const collected = [];
    const fetchMailbox = async (mailbox, mailboxType) => {
      const lock = await client.getMailboxLock(mailbox);
      try {
        for await (const message of client.fetch(
          { since: start, before: new Date(end.getTime() + 1e3) },
          { source: true, envelope: true }
        )) {
          if (collected.length >= config.maxMessages) {
            break;
          }
          const parsed = await simpleParser(message.source);
          const normalized = this.toEmailMessage(
            parsed,
            mailboxType,
            String(message.uid ?? crypto.randomUUID())
          );
          if (this.isWithinRange(normalized.date, start, end) && this.matchesFilters(normalized)) {
            collected.push(normalized);
          }
        }
      } finally {
        lock.release();
      }
    };
    try {
      await client.connect();
      await fetchMailbox(config.mailbox, "inbox");
      await fetchMailbox(config.sentMailbox, "sent");
    } finally {
      try {
        await client.logout();
      } catch (error) {
        this.logger.warn(`Failed to close IMAP connection: ${error}`);
      }
    }
    return collected.sort((a, b) => a.date.getTime() - b.date.getTime());
  }
  async fetchPop3(config, start, end) {
    const client = new Pop3Command({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      ...config.tls ? { tls: true, tlsOptions: { rejectUnauthorized: false } } : { tls: false }
    });
    const messages = [];
    try {
      await client.connect();
      await client.command("USER", config.user);
      await client.command("PASS", config.password);
      const uidlList = await client.UIDL();
      const allMessageIds = uidlList.map((entry) => Array.isArray(entry) ? entry[0] : void 0).map((id) => Number.parseInt(String(id ?? ""), 10)).filter((id) => Number.isFinite(id));
      if (allMessageIds.length === 0) {
        return [];
      }
      const limit = Math.max(0, Math.min(config.maxMessages, allMessageIds.length));
      const targetIds = allMessageIds.slice(allMessageIds.length - limit);
      for (const messageId of targetIds.reverse()) {
        try {
          const rawMessage = await client.RETR(messageId);
          const parsed = await simpleParser(rawMessage);
          const normalized = this.toEmailMessage(parsed, "inbox", String(messageId));
          if (this.isWithinRange(normalized.date, start, end) && this.matchesFilters(normalized)) {
            messages.push(normalized);
          }
        } catch (error) {
          this.logger.warn(`POP3 message parsing failed (${messageId}): ${error}`);
        }
      }
    } finally {
      try {
        await client.QUIT();
      } catch (error) {
        this.logger.warn(`POP3 QUIT error: ${error}`);
      }
    }
    return messages.sort((a, b) => a.date.getTime() - b.date.getTime());
  }
  async fetchGmail(config, start, end) {
    const oauth2 = new google.auth.OAuth2(config.clientId, config.clientSecret);
    const credentials = {
      refresh_token: config.refreshToken
    };
    if (config.accessToken !== void 0) {
      credentials.access_token = config.accessToken;
    }
    oauth2.setCredentials(credentials);
    const gmail = google.gmail({ version: "v1", auth: oauth2 });
    const after = new Date(start.getTime() - 24 * 60 * 60 * 1e3);
    const before = new Date(end.getTime() + 24 * 60 * 60 * 1e3);
    const toDateToken = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}/${m}/${day}`;
    };
    const filters = [];
    filters.push(`after:${toDateToken(after)}`);
    filters.push(`before:${toDateToken(before)}`);
    if (config.from && config.from.length > 0) {
      filters.push(`from:(${config.from.join(" OR ")})`);
    }
    if (config.to && config.to.length > 0) {
      filters.push(`to:(${config.to.join(" OR ")})`);
    }
    const query = filters.join(" ");
    const { data } = await gmail.users.messages.list({
      userId: config.userId,
      labelIds: config.labelIds,
      maxResults: config.maxMessages,
      q: query
    });
    const ids = data.messages ?? [];
    const messages = [];
    for (const m of ids) {
      if (!m.id) continue;
      const { data: message } = await gmail.users.messages.get({
        userId: config.userId,
        id: m.id,
        format: "metadata",
        metadataHeaders: ["From", "To", "Subject", "Date"]
      });
      const headers = message.payload?.headers ?? [];
      const readHeader = (name) => {
        const header = headers.find(
          (h) => h.name?.toLowerCase() === name.toLowerCase()
        );
        return header?.value ?? void 0;
      };
      const date = readHeader("Date") ? new Date(readHeader("Date")) : void 0;
      const snippet = extractSnippet(message.snippet ?? void 0);
      const msg = {
        id: message.id ?? m.id,
        subject: readHeader("Subject") ?? "(no subject)",
        to: normalizeAddresses(readHeader("To")?.split(",")),
        date: date ?? /* @__PURE__ */ new Date(),
        mailbox: message.labelIds?.includes("SENT") ? "sent" : "inbox"
      };
      if (snippet) {
        msg.snippet = snippet;
      }
      const from = pickAddress(readHeader("From"));
      if (from) {
        msg.from = from;
      }
      if (this.isWithinRange(msg.date, start, end) && this.matchesFilters(msg)) {
        messages.push(msg);
      }
    }
    return messages.sort((a, b) => a.date.getTime() - b.date.getTime());
  }
}
const __vite_glob_0_3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  EmailService
}, Symbol.toStringTag, { value: "Module" }));
const formatTime$1 = (date) => {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};
const truncate$1 = (text, limit = 200) => {
  if (!text) return "";
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
};
const buildPrompt$2 = (input) => {
  const lines = [];
  const sorted = [...input.messages].sort((a, b) => a.date.getTime() - b.date.getTime());
  lines.push("You are summarizing a day of email activity (sent and received).");
  lines.push("Highlight key work themes, decisions, follow-ups, and noteworthy correspondents.");
  lines.push("Be concise (2-4 paragraphs) and write in the first person.");
  lines.push(`Date: ${input.date.toISOString().split("T")[0]}`);
  lines.push(`Provider: ${input.provider}`);
  if (input.fromFilters?.length) {
    lines.push(`From filter: ${input.fromFilters.join(", ")}`);
  }
  if (input.toFilters?.length) {
    lines.push(`To filter: ${input.toFilters.join(", ")}`);
  }
  lines.push("");
  lines.push("Messages:");
  for (const message of sorted) {
    const toList = message.to.length > 0 ? message.to.join(", ") : "(no to)";
    const from = message.from ?? "(unknown sender)";
    const snippet = truncate$1(message.snippet);
    lines.push(
      `- ${formatTime$1(message.date)} [${message.mailbox}] ${from} -> ${toList} | ${message.subject}${snippet ? ` | Snippet: ${snippet}` : ""}`
    );
  }
  lines.push("");
  lines.push(
    "Write a cohesive summary of the day. Emphasize outcomes, commitments, blockers, and follow-ups."
  );
  return lines.join("\n");
};
const __vite_glob_0_4 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  buildPrompt: buildPrompt$2
}, Symbol.toStringTag, { value: "Module" }));
const filterSchema = z.object({
  from: z.array(z.string().email()).optional(),
  to: z.array(z.string().email()).optional()
});
const imapSchema = z.object({
  provider: z.literal("imap"),
  host: z.string().min(1),
  port: z.number().int().positive(),
  secure: z.boolean().default(true),
  user: z.string().min(1),
  password: z.string().min(1),
  mailbox: z.string().default("INBOX"),
  sentMailbox: z.string().default("Sent"),
  maxMessages: z.number().int().min(1).max(500).default(200)
}).merge(filterSchema);
const pop3Schema = z.object({
  provider: z.literal("pop3"),
  host: z.string().min(1),
  port: z.number().int().positive(),
  tls: z.boolean().default(true),
  user: z.string().min(1),
  password: z.string().min(1),
  maxMessages: z.number().int().min(1).max(500).default(200)
}).merge(filterSchema);
const gmailSchema = z.object({
  provider: z.literal("gmail"),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  refreshToken: z.string().min(1),
  accessToken: z.string().optional(),
  userId: z.string().default("me"),
  labelIds: z.array(z.string()).default(["INBOX", "SENT"]),
  maxMessages: z.number().int().min(1).max(500).default(200)
}).merge(filterSchema);
const emailConfigSchema = z.discriminatedUnion("provider", [
  imapSchema,
  pop3Schema,
  gmailSchema
]);
const EmailInputPlugin = {
  name: "email",
  configSchema: emailConfigSchema,
  parseConfig: createPluginConfigParser("email", emailConfigSchema),
  description: "Fetches daily email (IMAP, POP3, or Gmail API) and summarizes sent/received conversations.",
  retrieve: async (ctx, config) => {
    const emailService = new EmailService(config, ctx.logger);
    const messages = await emailService.fetchDay(ctx.date);
    if (messages.length === 0) {
      return {
        pluginName: "Email",
        summary: "No email activity recorded.",
        metadata: { provider: config.provider, messages }
      };
    }
    const promptInput = {
      date: ctx.date,
      provider: config.provider,
      messages
    };
    if (config.from && config.from.length > 0) {
      promptInput.fromFilters = config.from;
    }
    if (config.to && config.to.length > 0) {
      promptInput.toFilters = config.to;
    }
    const prompt = buildPrompt$2(promptInput);
    const aiSummary = await ctx.aiSummarizer(prompt);
    const inboxCount = messages.filter((m) => m.mailbox === "inbox").length;
    const sentCount = messages.filter((m) => m.mailbox === "sent").length;
    const stats = `Messages: ${messages.length} (inbox: ${inboxCount}, sent: ${sentCount})`;
    return {
      pluginName: "Email",
      summary: `${aiSummary}

- ${stats}`,
      metadata: {
        provider: config.provider,
        messages,
        stats: { inbox: inboxCount, sent: sentCount, total: messages.length }
      }
    };
  }
};
const __vite_glob_0_2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: EmailInputPlugin,
  emailConfigSchema
}, Symbol.toStringTag, { value: "Module" }));
const __vite_glob_0_5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null
}, Symbol.toStringTag, { value: "Module" }));
const gitHubFeatures = [
  "commits",
  "pullRequests",
  "issues",
  "reviews",
  "comments",
  "repoCreations"
];
class GitHubService {
  octokit;
  logger;
  config;
  constructor(config, logger2) {
    this.config = config;
    const token = config.token;
    if (!token) {
      throw new Error("GitHub token is required");
    }
    this.octokit = new Octokit({
      auth: token
    });
    this.logger = logger2;
  }
  async fetchDayActivity(date, features2 = gitHubFeatures, includeRepos = [], excludeRepos = []) {
    const { data: user } = await this.octokit.users.getAuthenticated();
    const actualUsername = this.config.username || user.login;
    this.logger.info(
      `Fetching GitHub activity for ${actualUsername} on ${date.toISOString().split("T")[0]}`
    );
    const { start, end } = getDateRange(date);
    const enabled = new Set(features2 ?? gitHubFeatures);
    const [commits, pullRequests, repoCreations, issues, reviews, comments] = await Promise.all([
      enabled.has("commits") ? this.fetchCommits(actualUsername, start, end, includeRepos, excludeRepos) : Promise.resolve([]),
      enabled.has("pullRequests") ? this.fetchPullRequests(actualUsername, start, end, includeRepos, excludeRepos) : Promise.resolve([]),
      enabled.has("repoCreations") ? this.fetchRepoCreations(actualUsername, start, end, includeRepos, excludeRepos) : Promise.resolve([]),
      enabled.has("issues") ? this.fetchIssues(actualUsername, start, end, includeRepos, excludeRepos) : Promise.resolve([]),
      enabled.has("reviews") ? this.fetchReviews(actualUsername, start, end, includeRepos, excludeRepos) : Promise.resolve([]),
      enabled.has("comments") ? this.fetchComments(actualUsername, start, end, includeRepos, excludeRepos) : Promise.resolve([])
    ]);
    return {
      date: date.toISOString().split("T")[0] ?? "",
      username: actualUsername,
      commits,
      pullRequests,
      issues,
      reviews,
      comments,
      repoCreations,
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  async fetchCommits(username, start, end, includeRepos, excludeRepos) {
    try {
      const { data: events } = await this.octokit.request("GET /users/{username}/events", {
        username,
        per_page: 100
      });
      const commits = [];
      const processedRepos = /* @__PURE__ */ new Set();
      for (const event of events) {
        if (event.type === "PushEvent" && event.repo?.name) {
          const createdAt = event.created_at ?? (/* @__PURE__ */ new Date()).toISOString();
          const eventDate = new Date(createdAt);
          if (eventDate >= start && eventDate <= end) {
            const repoName = event.repo.name;
            if (!this.isRepoAllowed(repoName, includeRepos, excludeRepos)) {
              continue;
            }
            if (processedRepos.has(repoName)) {
              continue;
            }
            processedRepos.add(repoName);
            try {
              const [owner, repo] = repoName.split("/");
              if (!owner || !repo) continue;
              const { data: repoCommits } = await this.octokit.request(
                "GET /repos/{owner}/{repo}/commits",
                {
                  owner,
                  repo,
                  author: username,
                  since: start.toISOString(),
                  until: end.toISOString(),
                  per_page: 100
                }
              );
              for (const commit of repoCommits) {
                let diff;
                try {
                  const { data: commitDetails } = await this.octokit.request(
                    "GET /repos/{owner}/{repo}/commits/{ref}",
                    {
                      owner,
                      repo,
                      ref: commit.sha
                    }
                  );
                  if (commitDetails.files && commitDetails.files.length > 0) {
                    diff = commitDetails.files.map((file) => {
                      const patch = file.patch || "";
                      return `--- ${file.filename}
${patch}`;
                    }).join("\n\n");
                  }
                } catch (error) {
                  this.logger.warn(`Failed to fetch diff for commit ${commit.sha}: ${error}`);
                }
                const commitData = {
                  sha: commit.sha,
                  message: commit.commit.message,
                  author: commit.commit.author?.name ?? username,
                  date: commit.commit.author?.date ?? createdAt,
                  repo: repoName,
                  url: commit.html_url
                };
                if (diff) {
                  commitData.diff = diff;
                }
                commits.push(commitData);
              }
            } catch (error) {
              this.logger.warn(`Failed to fetch commits for ${repoName}: ${error}`);
            }
          }
        }
      }
      this.logger.success(`Found ${commits.length} commits`);
      return commits;
    } catch (error) {
      this.logger.error(`Failed to fetch commits: ${error}`);
      throw error;
    }
  }
  async fetchPullRequests(username, start, end, includeRepos, excludeRepos) {
    try {
      const query = `author:${username} type:pr created:${start.toISOString().split("T")[0]}..${end.toISOString().split("T")[0]}`;
      const { data } = await this.octokit.request("GET /search/issues", {
        q: query,
        per_page: 100,
        sort: "created",
        order: "desc"
      });
      const pullRequests = data.items.map((item) => {
        const repo = item.repository_url.split("/").slice(-2).join("/");
        if (!this.isRepoAllowed(repo, includeRepos, excludeRepos)) {
          return null;
        }
        const pr = {
          number: item.number,
          title: item.title,
          state: item.state,
          repo,
          url: item.html_url,
          createdAt: item.created_at
        };
        if (item.pull_request?.merged_at) {
          pr.mergedAt = item.pull_request.merged_at;
        }
        if (item.closed_at) {
          pr.closedAt = item.closed_at;
        }
        if (item.body) {
          pr.body = item.body;
        }
        return pr;
      }).filter(Boolean);
      this.logger.success(`Found ${pullRequests.length} pull requests`);
      return pullRequests;
    } catch (error) {
      this.logger.error(`Failed to fetch pull requests: ${error}`);
      throw error;
    }
  }
  async fetchIssues(username, start, end, includeRepos, excludeRepos) {
    try {
      const query = `author:${username} type:issue created:${start.toISOString().split("T")[0]}..${end.toISOString().split("T")[0]}`;
      const { data } = await this.octokit.request("GET /search/issues", {
        q: query,
        per_page: 100,
        sort: "created",
        order: "desc"
      });
      const issues = data.items.map((item) => {
        const repo = item.repository_url.split("/").slice(-2).join("/");
        if (!this.isRepoAllowed(repo, includeRepos, excludeRepos)) {
          return null;
        }
        const issue = {
          number: item.number,
          title: item.title,
          state: item.state,
          repo,
          url: item.html_url,
          createdAt: item.created_at
        };
        if (item.closed_at) {
          issue.closedAt = item.closed_at;
        }
        if (item.body) {
          issue.body = item.body;
        }
        return issue;
      }).filter(Boolean);
      this.logger.success(`Found ${issues.length} issues`);
      return issues;
    } catch (error) {
      this.logger.error(`Failed to fetch issues: ${error}`);
      throw error;
    }
  }
  async fetchReviews(username, start, end, includeRepos, excludeRepos) {
    const reviews = [];
    try {
      const query = `reviewed-by:${username} type:pr updated:${start.toISOString().split("T")[0]}..${end.toISOString().split("T")[0]}`;
      const { data } = await this.octokit.request("GET /search/issues", {
        q: query,
        per_page: 50,
        sort: "updated",
        order: "desc"
      });
      for (const item of data.items) {
        const [owner, repo] = item.repository_url.split("/").slice(-2);
        if (!owner || !repo) continue;
        const fullName = `${owner}/${repo}`;
        if (!this.isRepoAllowed(fullName, includeRepos, excludeRepos)) continue;
        try {
          const { data: prReviews } = await this.octokit.request(
            "GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews",
            {
              owner,
              repo,
              pull_number: item.number,
              per_page: 100
            }
          );
          for (const review of prReviews) {
            if (review.user?.login !== username) continue;
            const submittedAt = review.submitted_at;
            if (!submittedAt) continue;
            const submittedDate = new Date(submittedAt);
            if (submittedDate < start || submittedDate > end) continue;
            reviews.push({
              repo: `${owner}/${repo}`,
              pullNumber: item.number,
              state: review.state ?? "COMMENTED",
              submittedAt,
              url: review.html_url ?? review._links?.html?.href ?? item.html_url,
              body: review.body ?? void 0
            });
          }
        } catch (error) {
          this.logger.warn(`Failed to fetch reviews for ${repo}#${item.number}: ${error}`);
        }
      }
      this.logger.success(`Found ${reviews.length} reviews`);
      return reviews;
    } catch (error) {
      this.logger.error(`Failed to fetch reviews: ${error}`);
      throw error;
    }
  }
  async fetchComments(username, start, end, includeRepos, excludeRepos) {
    const comments = [];
    try {
      const query = `commenter:${username} type:issue updated:${start.toISOString().split("T")[0]}..${end.toISOString().split("T")[0]}`;
      const { data } = await this.octokit.request("GET /search/issues", {
        q: query,
        per_page: 50,
        sort: "updated",
        order: "desc"
      });
      for (const item of data.items) {
        const [owner, repo] = item.repository_url.split("/").slice(-2);
        if (!owner || !repo) continue;
        const fullName = `${owner}/${repo}`;
        if (!this.isRepoAllowed(fullName, includeRepos, excludeRepos)) continue;
        try {
          const { data: issueComments } = await this.octokit.request(
            "GET /repos/{owner}/{repo}/issues/{issue_number}/comments",
            {
              owner,
              repo,
              issue_number: item.number,
              per_page: 100
            }
          );
          for (const comment of issueComments) {
            if (comment.user?.login !== username) continue;
            const createdAt = comment.created_at;
            if (!createdAt) continue;
            const createdDate = new Date(createdAt);
            if (createdDate < start || createdDate > end) continue;
            comments.push({
              repo: `${owner}/${repo}`,
              issueNumber: item.number,
              url: comment.html_url,
              body: comment.body ?? "",
              createdAt,
              type: item.pull_request ? "pr" : "issue"
            });
          }
        } catch (error) {
          this.logger.warn(`Failed to fetch comments for ${owner}/${repo}#${item.number}: ${error}`);
        }
      }
      this.logger.success(`Found ${comments.length} comments`);
      return comments;
    } catch (error) {
      this.logger.error(`Failed to fetch comments: ${error}`);
      throw error;
    }
  }
  async fetchRepoCreations(username, start, end, includeRepos, excludeRepos) {
    try {
      const { data: repos } = await this.octokit.request("GET /user/repos", {
        per_page: 100,
        sort: "created",
        direction: "desc"
      });
      const repoCreations = [];
      for (const repo of repos) {
        const createdAt = repo.created_at;
        if (!createdAt) continue;
        const createdDate = new Date(createdAt);
        const fullName = repo.full_name;
        if (!this.isRepoAllowed(fullName, includeRepos, excludeRepos)) continue;
        if (createdDate >= start && createdDate <= end && repo.owner?.login === username) {
          const repoCreation = {
            name: repo.full_name,
            isPrivate: repo.private,
            url: repo.html_url,
            createdAt
          };
          if (repo.description) {
            repoCreation.description = repo.description;
          }
          repoCreations.push(repoCreation);
        }
      }
      this.logger.success(`Found ${repoCreations.length} repository creations`);
      return repoCreations;
    } catch (error) {
      this.logger.error(`Failed to fetch repository creations: ${error}`);
      throw error;
    }
  }
  async verifyConnection() {
    try {
      const { data } = await this.octokit.users.getAuthenticated();
      this.logger.success(`Connected to GitHub as ${data.login}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to connect to GitHub: ${error}`);
      return false;
    }
  }
  isRepoAllowed(repo, includeRepos, excludeRepos) {
    if (excludeRepos.length && excludeRepos.includes(repo)) {
      return false;
    }
    if (includeRepos.length && !includeRepos.includes(repo)) {
      return false;
    }
    return true;
  }
}
const __vite_glob_0_7 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  GitHubService
}, Symbol.toStringTag, { value: "Module" }));
const buildPrompt$1 = (data) => {
  const sections = [];
  sections.push(
    `You are a helpful assistant that summarizes a developer's daily work based on their GitHub activity.`
  );
  sections.push(`
Date: ${data.date}`);
  sections.push(`User: ${data.username}`);
  if (data.commits.length > 0) {
    sections.push(`
## Commits (${data.commits.length})
`);
    for (const commit of data.commits) {
      sections.push(`- [${commit.repo}] ${commit.message}`);
      if (commit.diff) {
        sections.push(
          `
  Diff:
\`\`\`diff
${commit.diff.substring(0, 1e3)}${commit.diff.length > 1e3 ? "\n... (diff truncated)" : ""}
\`\`\`
`
        );
      }
    }
  }
  if (data.pullRequests.length > 0) {
    sections.push(`
## Pull Requests (${data.pullRequests.length})
`);
    for (const pr of data.pullRequests) {
      sections.push(`- [${pr.repo}] #${pr.number}: ${pr.title} (${pr.state})`);
      if (pr.body) {
        sections.push(
          `  Description: ${pr.body.substring(0, 200)}${pr.body.length > 200 ? "..." : ""}`
        );
      }
    }
  }
  if (data.issues.length > 0) {
    sections.push(`
## Issues (${data.issues.length})
`);
    for (const issue of data.issues) {
      sections.push(`- [${issue.repo}] #${issue.number}: ${issue.title} (${issue.state})`);
      if (issue.body) {
        sections.push(
          `  Description: ${issue.body.substring(0, 200)}${issue.body.length > 200 ? "..." : ""}`
        );
      }
    }
  }
  if (data.reviews.length > 0) {
    sections.push(`
## Reviews (${data.reviews.length})
`);
    for (const review of data.reviews) {
      sections.push(`- [${review.repo}] #${review.pullNumber}: review ${review.state}`);
      if (review.body) {
        sections.push(
          `  Comments: ${review.body.substring(0, 200)}${review.body.length > 200 ? "..." : ""}`
        );
      }
    }
  }
  if (data.repoCreations.length > 0) {
    sections.push(`
## New Repositories Created (${data.repoCreations.length})
`);
    for (const repo of data.repoCreations) {
      const privacy = repo.isPrivate ? "🔒 Private" : "🌐 Public";
      sections.push(`- ${repo.name} (${privacy})`);
      if (repo.description) {
        sections.push(`  Description: ${repo.description}`);
      }
    }
  }
  sections.push(`
## Instructions`);
  sections.push(`Write a concise, professional summary of the work done today. Focus on:`);
  sections.push(`1. Main accomplishments and features worked on`);
  sections.push(`2. Problems solved or bugs fixed`);
  sections.push(`3. Any notable patterns or themes in the work`);
  sections.push(`4. Technologies and repositories involved`);
  sections.push(
    `
Write in first person ("I worked on..."), keep it concise (2-4 paragraphs), and maintain a professional yet friendly tone.`
  );
  if (data.commits.length === 0 && data.pullRequests.length === 0 && data.repoCreations.length === 0 && data.issues.length === 0 && data.reviews.length === 0 && data.comments.length === 0) {
    sections.push(`
Note: No activity was found for this day. Mention this in the summary.`);
  }
  return sections.join("\n");
};
const __vite_glob_0_8 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  buildPrompt: buildPrompt$1
}, Symbol.toStringTag, { value: "Module" }));
const features = ["commits", "pullRequests", "issues", "reviews", "comments"];
const featureEnum = z.enum(features);
const gitGithubConfigSchema = z.object({
  username: z.string().min(1, "username is required").describe("GitHub username to fetch activity for"),
  token: z.string().min(1, "token is required").describe("GitHub personal access token"),
  include: z.array(z.string()).optional().describe("List of repos to include in the summary"),
  exclude: z.array(z.string()).optional().describe("List of repos to exclude from the summary"),
  // The features to include in the summary (default: all)
  features: z.array(featureEnum).default([...features]).describe("The features to include in the summary")
});
const GitHubInputPlugin = {
  name: "github",
  configSchema: gitGithubConfigSchema,
  parseConfig: createPluginConfigParser("github", gitGithubConfigSchema),
  description: "Fetches your daily data (commits, PRs, etc) from a GitHub and creates a summary",
  retrieve: async (ctx, config) => {
    const githubService = new GitHubService(config, ctx.logger);
    const rawData = await githubService.fetchDayActivity(
      ctx.date,
      config.features,
      config.include ?? [],
      config.exclude ?? []
    );
    const prompt = buildPrompt$1(rawData);
    const activityEvents = Object.values(rawData).flat().length;
    let summary = "";
    if (activityEvents === 0) {
      ctx.logger.info("No GitHub activity found for the specified date.");
    } else {
      ctx.logger.info(`Generating GitHub activity summary with ${activityEvents} events.`);
      const aiSummary = await ctx.aiSummarizer(prompt);
      ctx.logger.debug(`GitHub AI Summary: ${aiSummary}`);
      summary += aiSummary;
    }
    const stats = [];
    stats.push(`Commits: ${rawData.commits.length}`);
    stats.push(`PRs: ${rawData.pullRequests.length}`);
    stats.push(`Issues: ${rawData.issues.length}`);
    stats.push(`Reviews: ${rawData.reviews.length}`);
    stats.push(`Comments: ${rawData.comments.length}`);
    stats.push(`New Repos: ${rawData.repoCreations.length}`);
    return {
      pluginName: "GitHub",
      summary: activityEvents ? summary + `

- ${stats.join(" - ")}` : "No activity recorded.",
      metadata: {
        comments: rawData.comments,
        commits: rawData.commits,
        issues: rawData.issues,
        pullRequests: rawData.pullRequests,
        repoCreations: rawData.repoCreations,
        reviews: rawData.reviews
      }
    };
  }
};
const __vite_glob_0_6 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: GitHubInputPlugin
}, Symbol.toStringTag, { value: "Module" }));
const __vite_glob_0_9 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null
}, Symbol.toStringTag, { value: "Module" }));
const SLACK_API_BASE = "https://slack.com/api/";
class SlackService {
  constructor(token, logger2) {
    this.token = token;
    this.logger = logger2;
  }
  userCache = /* @__PURE__ */ new Map();
  async api(method, params = {}) {
    const url = new URL(`${SLACK_API_BASE}${method}`);
    for (const [key, value] of Object.entries(params)) {
      if (value === void 0) continue;
      url.searchParams.set(key, String(value));
    }
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`
      }
    });
    if (!res.ok) {
      throw new Error(`Slack API request failed (${method}): HTTP ${res.status}`);
    }
    const json = await res.json();
    if (!json.ok) {
      throw new Error(`Slack API error (${method}): ${json.error ?? "unknown"}`);
    }
    return json;
  }
  async listConversations(types, maxCount) {
    let cursor;
    const conversations = [];
    while (true) {
      const resp = await this.api("conversations.list", {
        types,
        limit: 200,
        cursor
      });
      conversations.push(...resp.channels);
      if (!resp.response_metadata?.next_cursor || conversations.length >= maxCount) {
        break;
      }
      cursor = resp.response_metadata.next_cursor;
    }
    return conversations.slice(0, maxCount);
  }
  async fetchConversationHistory(channel, oldest, latest, maxMessages) {
    let cursor;
    const messages = [];
    while (true) {
      const resp = await this.api("conversations.history", {
        channel,
        oldest,
        latest,
        limit: 200,
        cursor,
        inclusive: true
      });
      messages.push(...resp.messages);
      if (!resp.has_more || messages.length >= maxMessages || !resp.response_metadata?.next_cursor) {
        break;
      }
      cursor = resp.response_metadata.next_cursor;
    }
    return messages.slice(0, maxMessages);
  }
  async fetchThreadReplies(channel, threadTs, oldest, latest) {
    let cursor;
    const messages = [];
    while (true) {
      const resp = await this.api("conversations.replies", {
        channel,
        ts: threadTs,
        oldest,
        latest,
        limit: 200,
        cursor,
        inclusive: true
      });
      messages.push(...resp.messages);
      if (!resp.has_more || !resp.response_metadata?.next_cursor) {
        break;
      }
      cursor = resp.response_metadata.next_cursor;
    }
    return messages;
  }
  extractDisplayName(user) {
    if (!user) return void 0;
    return user.profile?.display_name || user.profile?.real_name || user.real_name || user.name || user.id;
  }
  async resolveUserName(userId) {
    if (this.userCache.has(userId)) {
      return this.userCache.get(userId);
    }
    try {
      const resp = await this.api("users.info", { user: userId });
      const name = this.extractDisplayName(resp.user) ?? userId;
      this.userCache.set(userId, name);
      return name;
    } catch (error) {
      this.logger.warn(`Unable to resolve Slack user name for ${userId}: ${String(error)}`);
      this.userCache.set(userId, userId);
      return userId;
    }
  }
  async resolveUserNames(userIds) {
    const uniqueIds = Array.from(new Set(userIds));
    return Promise.all(uniqueIds.map(async (id) => ({ id, name: await this.resolveUserName(id) })));
  }
}
const normalizeReactions = (reactions) => {
  if (!reactions || reactions.length === 0) return [];
  return reactions.map((r) => ({
    name: r.name,
    count: typeof r.count === "number" ? r.count : 0
  }));
};
const countReactions = (reactions) => {
  return normalizeReactions(reactions).reduce((acc, r) => acc + r.count, 0);
};
const isUserMessage = (msg) => {
  return !!msg.user && (!msg.subtype || msg.subtype === "thread_broadcast");
};
const __vite_glob_0_11 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  SlackService,
  countReactions,
  isUserMessage,
  normalizeReactions
}, Symbol.toStringTag, { value: "Module" }));
const formatTime = (ts) => {
  const millis = Number.parseFloat(ts) * 1e3;
  const date = new Date(Number.isFinite(millis) ? millis : 0);
  return date.toISOString().substring(11, 16);
};
const truncate = (text, limit = 320) => {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
};
const renderReactions = (reactions) => {
  if (!reactions.length) return "";
  const parts = reactions.map((r) => `${r.name}:${r.count}`);
  return ` [reactions: ${parts.join(", ")}]`;
};
const buildPrompt = (input) => {
  const userMap = new Map(input.users.map((u) => [u.id, u.name]));
  const lines = [];
  lines.push("You are summarizing Slack activity for the specified users only.");
  lines.push(
    "Do not attribute messages from users outside the provided list except as context for threads."
  );
  lines.push(
    "Highlight key work themes, decisions, blockers, and follow-ups; keep it concise (2-4 paragraphs)."
  );
  lines.push(`Date: ${input.date}`);
  lines.push(`Users: ${input.users.map((u) => `${u.name} (${u.id})`).join(", ")}`);
  lines.push("");
  lines.push("Data:");
  for (const convo of input.conversations) {
    lines.push(`Conversation: ${convo.name} (${convo.type})`);
    for (const message of convo.messages) {
      const author = userMap.get(message.user) ?? message.user;
      lines.push(
        `- ${formatTime(message.ts)} ${author}: ${truncate(message.text)}${renderReactions(message.reactions)}`
      );
    }
    for (const thread of convo.threads) {
      const rootAuthor = thread.root.user ? userMap.get(thread.root.user) ?? thread.root.user : "unknown";
      lines.push(
        `- Thread ${thread.threadTs} started by ${rootAuthor}: ${truncate(thread.root.text)}${renderReactions(thread.root.reactions)}`
      );
      for (const reply of thread.userMessages) {
        const author = userMap.get(reply.user) ?? reply.user;
        lines.push(
          `  - ${formatTime(reply.ts)} ${author}: ${truncate(reply.text)}${renderReactions(reply.reactions)}`
        );
      }
    }
    lines.push("");
  }
  lines.push(
    "Summarize only what these users did, referencing channels/DMs when helpful. Include thread/reaction insights where relevant."
  );
  return lines.join("\n");
};
const __vite_glob_0_12 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  buildPrompt
}, Symbol.toStringTag, { value: "Module" }));
const slackConfigSchema = z.object({
  token: z.string().min(1).describe("Slack bot or user token with the required scopes"),
  users: z.array(z.string().min(1)).nonempty().describe("Slack user IDs to summarize (only their messages are considered)"),
  include: z.array(z.string().min(1)).default([]).describe("Conversation IDs to include (channels or DMs). If empty, all are allowed."),
  exclude: z.array(z.string().min(1)).default([]).describe("Conversation IDs to exclude. Exclusion wins if an ID is in both lists."),
  includeDMs: z.boolean().default(false).describe("Whether to fetch DMs and group DMs"),
  maxChannels: z.number().int().min(1).max(200).default(50).describe("Maximum conversations to scan"),
  maxMessagesPerChannel: z.number().int().min(1).max(2e3).default(400).describe("Maximum messages to pull per conversation within the window")
});
const buildConversationName = (name, type, id) => {
  if (name) {
    return type === "channel" ? `#${name}` : name;
  }
  return id;
};
const SlackPlugin = {
  name: "slack",
  configSchema: slackConfigSchema,
  parseConfig: createPluginConfigParser("slack", slackConfigSchema),
  description: "Summarizes Slack messages, threads, and reactions for specified users.",
  retrieve: async (ctx, config) => {
    const { start, end } = getDateRange(ctx.date);
    const oldest = Math.floor(start.getTime() / 1e3);
    const latest = Math.floor(end.getTime() / 1e3);
    const targetUsers = new Set(config.users);
    const include = new Set(config.include);
    const exclude = new Set(config.exclude);
    const slack = new SlackService(config.token, ctx.logger);
    const types = config.includeDMs ? "public_channel,private_channel,mpim,im" : "public_channel,private_channel";
    const conversations = await slack.listConversations(types, config.maxChannels);
    const allowed = conversations.filter((conversation) => {
      const id = conversation.id;
      if (!config.includeDMs && (conversation.is_im || conversation.is_mpim)) {
        return false;
      }
      if (exclude.has(id)) {
        return false;
      }
      if (include.size > 0 && !include.has(id)) {
        return false;
      }
      return true;
    });
    const activities = [];
    let totalMessages = 0;
    let totalThreads = 0;
    let totalThreadReplies = 0;
    let totalReactions = 0;
    for (const conversation of allowed) {
      const history = await slack.fetchConversationHistory(
        conversation.id,
        oldest,
        latest,
        config.maxMessagesPerChannel
      );
      const targetMessages = history.filter(isUserMessage).filter((msg) => targetUsers.has(msg.user));
      if (targetMessages.length === 0) {
        continue;
      }
      const threadIds = /* @__PURE__ */ new Set();
      const standaloneMessages = [];
      for (const msg of targetMessages) {
        if (msg.thread_ts) {
          threadIds.add(msg.thread_ts);
          continue;
        }
        standaloneMessages.push({
          ts: msg.ts,
          text: msg.text ?? "",
          user: msg.user,
          reactions: normalizeReactions(msg.reactions)
        });
      }
      const threads = [];
      for (const threadTs of threadIds) {
        const threadMessages = await slack.fetchThreadReplies(
          conversation.id,
          threadTs,
          oldest,
          latest
        );
        if (threadMessages.length === 0) continue;
        const root = threadMessages[0];
        if (!root) continue;
        const rootUser = root.user;
        const targetThreadMessages = threadMessages.filter(isUserMessage).filter((msg) => targetUsers.has(msg.user));
        if (targetThreadMessages.length === 0) continue;
        threads.push({
          threadTs,
          root: {
            ts: root.ts,
            ...rootUser ? { user: rootUser } : {},
            text: root.text ?? "",
            reactions: normalizeReactions(root.reactions)
          },
          userMessages: targetThreadMessages.map((msg) => ({
            ts: msg.ts,
            text: msg.text ?? "",
            user: msg.user,
            reactions: normalizeReactions(msg.reactions)
          }))
        });
        totalMessages += targetThreadMessages.length;
        totalThreadReplies += targetThreadMessages.filter((msg) => msg.ts !== threadTs).length;
        totalReactions += targetThreadMessages.reduce(
          (acc, msg) => acc + countReactions(msg.reactions),
          0
        );
      }
      totalMessages += standaloneMessages.length;
      totalThreads += threads.length;
      totalReactions += standaloneMessages.reduce(
        (acc, msg) => acc + countReactions(msg.reactions),
        0
      );
      activities.push({
        id: conversation.id,
        name: buildConversationName(
          conversation.name,
          conversation.is_im ? "dm" : conversation.is_mpim ? "group" : "channel",
          conversation.id
        ),
        type: conversation.is_im ? "dm" : conversation.is_mpim ? "group" : "channel",
        messages: standaloneMessages,
        threads
      });
    }
    const resolvedUsers = await slack.resolveUserNames(config.users);
    const diaryDate = ctx.date.toISOString().split("T")[0] ?? "";
    const prompt = buildPrompt({
      date: diaryDate,
      users: resolvedUsers,
      conversations: activities
    });
    let summary = "No Slack activity recorded.";
    if (activities.length > 0) {
      const aiSummary = await ctx.aiSummarizer(prompt);
      const stats = [
        `Conversations scanned: ${allowed.length}`,
        `Messages from targets: ${totalMessages}`,
        `Threads touched: ${totalThreads}`,
        `Thread replies from targets: ${totalThreadReplies}`,
        `Reactions on their messages: ${totalReactions}`
      ];
      summary = `${aiSummary}

- ${stats.join("\n- ")}`;
    }
    return {
      pluginName: "Slack",
      summary,
      metadata: {
        activities,
        stats: {
          conversationsScanned: allowed.length,
          messagesFromTargets: totalMessages,
          threads: totalThreads,
          threadRepliesFromTargets: totalThreadReplies,
          reactionsOnTargetMessages: totalReactions
        }
      }
    };
  }
};
const __vite_glob_0_10 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: SlackPlugin
}, Symbol.toStringTag, { value: "Module" }));
const consoleConfigSchema = z.object({});
const ConsolePlugin = {
  name: "console",
  configSchema: consoleConfigSchema,
  parseConfig: createPluginConfigParser("console", consoleConfigSchema),
  description: "Logs the daily summary to the console.",
  output: async (_ctx, summary, _config) => {
    console.log(summary.content);
  }
};
const __vite_glob_0_13 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: ConsolePlugin
}, Symbol.toStringTag, { value: "Module" }));
const fileOutputConfigSchema = z.object({
  path: z.string().min(1),
  mode: z.enum(["replace", "merge"]).default("merge"),
  startMarker: z.string().default(DEFAULT_START_MARKER),
  endMarker: z.string().default(DEFAULT_END_MARKER)
});
const ensureDirectory = async (filePath) => {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
};
const expandTilde = (filePath) => {
  if (filePath.startsWith("~")) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
};
const resolveTargetPath = (template, date) => {
  const rendered = template.replaceAll("{date}", formatDate(date));
  const expanded = expandTilde(rendered);
  return path.resolve(expanded);
};
const extractMarkedBlock = (content, startMarker, endMarker) => {
  const startIndex = content.indexOf(startMarker);
  if (startIndex === -1) return null;
  const endIndex = content.indexOf(endMarker, startIndex + startMarker.length);
  if (endIndex === -1) return null;
  const endExclusive = endIndex + endMarker.length;
  return {
    block: content.slice(startIndex, endExclusive),
    startIndex,
    endIndex: endExclusive
  };
};
const mergeWithMarkers = (existingContent, newContent, startMarker, endMarker) => {
  const newBlock = extractMarkedBlock(newContent, startMarker, endMarker);
  if (!newBlock) {
    return newContent;
  }
  const existingBlock = extractMarkedBlock(existingContent, startMarker, endMarker);
  if (!existingBlock) {
    const separator = existingContent.length > 0 && !existingContent.endsWith("\n") ? "\n\n" : "";
    return `${existingContent}${separator}${newBlock.block}`;
  }
  return existingContent.slice(0, existingBlock.startIndex) + newBlock.block + existingContent.slice(existingBlock.endIndex);
};
const FileOutputPlugin = {
  name: "file",
  configSchema: fileOutputConfigSchema,
  parseConfig: createPluginConfigParser("file", fileOutputConfigSchema),
  description: "Writes the daily summary to a file (supports {date} in path) with optional merge.",
  output: async (ctx, summary, config) => {
    const targetPath = resolveTargetPath(config.path, ctx.date);
    await ensureDirectory(targetPath);
    ctx.logger.info(`Writing summary to file: ${targetPath}`);
    if (config.mode === "replace") {
      await fs.writeFile(targetPath, summary.content, "utf-8");
      return;
    }
    const newContent = summary.content;
    try {
      const existingContent = await fs.readFile(targetPath, "utf-8");
      const merged = mergeWithMarkers(
        existingContent,
        newContent,
        config.startMarker,
        config.endMarker
      );
      await fs.writeFile(targetPath, merged, "utf-8");
    } catch (error) {
      const err = error;
      if (err.code !== "ENOENT") {
        throw err;
      }
      await fs.writeFile(targetPath, newContent, "utf-8");
    }
  }
};
const __vite_glob_0_14 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: FileOutputPlugin
}, Symbol.toStringTag, { value: "Module" }));
class PluginRegistry {
  constructor(logger2) {
    this.logger = logger2;
  }
  plugins = /* @__PURE__ */ new Map();
  async init() {
    await this.loadPlugins();
  }
  isPluginLike(maybe) {
    if (!maybe || typeof maybe !== "object") {
      return false;
    }
    return typeof maybe.name === "string" && Boolean(maybe.configSchema) && typeof maybe.parseConfig === "function";
  }
  async loadPlugins() {
    const modules = /* @__PURE__ */ Object.assign({
      "./config.ts": __vite_glob_0_0,
      "./formatter/markdown/index.ts": __vite_glob_0_1,
      "./input/email/index.ts": __vite_glob_0_2,
      "./input/email/service.ts": __vite_glob_0_3,
      "./input/email/tools.ts": __vite_glob_0_4,
      "./input/email/types.ts": __vite_glob_0_5,
      "./input/github/index.ts": __vite_glob_0_6,
      "./input/github/service.ts": __vite_glob_0_7,
      "./input/github/tools.ts": __vite_glob_0_8,
      "./input/github/types.ts": __vite_glob_0_9,
      "./input/slack/index.ts": __vite_glob_0_10,
      "./input/slack/service.ts": __vite_glob_0_11,
      "./input/slack/tools.ts": __vite_glob_0_12,
      "./output/console/index.ts": __vite_glob_0_13,
      "./output/file/index.ts": __vite_glob_0_14
    });
    this.logger.info(`Loading plugins from bundle: ${Object.keys(modules).length} candidates`);
    for (const [file, mod] of Object.entries(modules)) {
      if (/\.(test|spec)\.[^.]+$/.test(file)) {
        this.logger.debug(`Skipping test module: ${file}`);
        continue;
      }
      const plugin = mod?.default;
      if (this.isPluginLike(plugin)) {
        const pluginEntry = this.register(plugin);
        this.logger.info(
          `Loaded plugin: ${pluginEntry.plugin.name}, capabilities: ${pluginEntry.capabilities.join(", ")}`
        );
        continue;
      }
      this.logger.debug(`Skipping non-plugin module: ${file}`);
    }
  }
  getPluginCapabilities(plugin) {
    const capabilities = [];
    if (plugin.retrieve) {
      capabilities.push("input");
    }
    if (plugin.format) {
      capabilities.push("formatter");
    }
    if (plugin.output) {
      capabilities.push("output");
    }
    return capabilities;
  }
  register(plugin) {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin already registered: ${plugin.name}`);
    }
    const entry = {
      capabilities: this.getPluginCapabilities(plugin),
      plugin
    };
    this.plugins.set(plugin.name, entry);
    return entry;
  }
  checkHaveCapability(name, capability) {
    const entry = this.plugins.get(name);
    if (!entry) {
      throw new Error(`Unknown plugin: ${name}`);
    }
    return entry.capabilities.includes(capability);
  }
  get(name) {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Unknown plugin: ${name}`);
    }
    return plugin.plugin;
  }
}
let registryInstance = null;
const getPluginRegistry = async () => {
  if (registryInstance) {
    return registryInstance;
  }
  const registry = new PluginRegistry(logger);
  await registry.init();
  registryInstance = registry;
  return registry;
};
const isInputPlugin = (plugin) => {
  return !!plugin && typeof plugin === "object" && typeof plugin.retrieve === "function";
};
const isFormatterPlugin = (plugin) => {
  return !!plugin && typeof plugin === "object" && typeof plugin.format === "function";
};
const isOutputPlugin = (plugin) => {
  return !!plugin && typeof plugin === "object" && typeof plugin.output === "function";
};
class AIService {
  config;
  logger;
  constructor(config, logger2) {
    this.config = config;
    this.logger = logger2;
  }
  getModel() {
    if (this.config.provider === "openai") {
      return openai(this.config.model);
    }
    if (this.config.provider === "anthropic") {
      return anthropic(this.config.model);
    }
    if (this.config.provider === "google") {
      const google2 = createGoogleGenerativeAI({
        apiKey: this.config.apiKey
      });
      return google2(this.config.model);
    }
    throw new Error(`Unsupported AI provider: ${this.config.provider}`);
  }
  async generate(prompt, temperature) {
    this.logger.info("Generating AI text...");
    const model = this.getModel();
    try {
      const { text } = await generateText({
        model,
        prompt,
        temperature
      });
      return text;
    } catch (error) {
      this.logger.error(`Failed to generate text: ${error}`);
      throw error;
    }
  }
}
async function runWorkflow(date, config) {
  const registry = await getPluginRegistry();
  const ai = new AIService(config.ai, logger);
  const ctx = {
    date,
    config: { dateFormat: config.dateFormat ?? "YYYY-MM-DD" },
    logger
  };
  const summarizedResults = await Promise.allSettled(
    config.inputs.map(async (input) => {
      if (!input.enabled) {
        return;
      }
      const plugin = registry.get(input.plugin);
      if (!isInputPlugin(plugin)) {
        throw new Error(`Plugin ${input.plugin} does not implement a input capability`);
      }
      const parsedConfig = plugin.parseConfig(input.config ?? {});
      logger.info(`Retrieving data: ${input.id} (${input.plugin})`);
      const result = await plugin.retrieve(
        {
          ...ctx,
          aiSummarizer: (prompt) => ai.generate(prompt, 0.7)
        },
        parsedConfig
      );
      return { id: input.id, plugin, config: parsedConfig, summaryResult: result };
    })
  );
  const inputsSummaries = [];
  for (const res of summarizedResults) {
    if (res.status === "fulfilled" && res.value) {
      inputsSummaries.push(res.value.summaryResult);
    } else if (res.status === "rejected") {
      logger.error(`Error during input retrieval: ${res.reason}`);
    }
  }
  const formatterPlugin = registry.get(config.formatter.plugin);
  if (!isFormatterPlugin(formatterPlugin)) {
    throw new Error(`Plugin ${config.formatter.plugin} does not implement a formatter capability`);
  }
  const formatterConfig = formatterPlugin.parseConfig(config.formatter.config ?? {});
  const output = await formatterPlugin.format(ctx, inputsSummaries, formatterConfig);
  await Promise.allSettled(
    config.outputs.map(async (outputPlugin) => {
      if (!outputPlugin.enabled) {
        return;
      }
      const plugin = registry.get(outputPlugin.plugin);
      if (!isOutputPlugin(plugin)) {
        throw new Error(`Plugin ${outputPlugin.plugin} does not implement a output capability`);
      }
      const parsedConfig = plugin.parseConfig(outputPlugin.config ?? {});
      logger.info(`Writing output: ${outputPlugin.plugin}`);
      await plugin.output(ctx, output, parsedConfig);
    })
  );
}
const aiConfigSchema = z.object({
  provider: z.enum(["openai", "anthropic", "google"]),
  apiKey: z.string().min(1),
  model: z.string().min(1),
  temperature: z.number().min(0).max(1).optional().default(0.7)
});
const PluginInstanceSchema = z.object({
  id: z.string().min(1).optional(),
  plugin: z.string().min(1),
  enabled: z.boolean().optional().default(true),
  config: z.unknown().optional()
});
const ConfigSchema = z.object({
  ai: aiConfigSchema,
  inputs: z.array(PluginInstanceSchema).min(1),
  formatter: z.object({
    plugin: z.string().min(1),
    config: z.unknown().optional()
  }),
  outputs: z.array(PluginInstanceSchema).min(1),
  dateFormat: z.string().optional()
});
dotenv.config();
const resolveEnvPlaceholders = (value) => {
  if (typeof value === "string") {
    const envMatch = value.match(/^env:([A-Z0-9_]+)$/i);
    if (envMatch && envMatch[1]) {
      const envVar = envMatch[1];
      const envValue = process$1.env[envVar];
      if (envValue === void 0) {
        logger.error(`Environment variable ${envVar} is not set`);
      }
      return envValue;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(resolveEnvPlaceholders);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [key, resolveEnvPlaceholders(val)])
    );
  }
  return value;
};
const getConfig = async (configPath) => {
  const fs2 = await import("node:fs/promises");
  const yaml = await import("yaml");
  const configContent = await fs2.readFile(configPath, "utf-8");
  const configData = yaml.parse(configContent);
  const resolvedConfigData = resolveEnvPlaceholders(configData);
  const config = ConfigSchema.parse(resolvedConfigData);
  return config;
};
async function main() {
  try {
    const program = new Command().name("workdiary").description("Generate a daily work diary from configured plugins").option("-c, --config <path>", "Path to config file", "workdiary.config.yaml").option("-d, --date <date>", "Date to summarize (YYYY-MM-DD)").option("--debug", "Enable verbose debug logging", false);
    const options = program.parse(process$1.argv).opts();
    if (options.debug) {
      process$1.env.DEBUG = "1";
      logger.debug("Debug logging enabled");
    }
    const config = await getConfig(path.resolve(process$1.cwd(), options.config));
    if (!options.date) {
      logger.info("No date specified, using current date");
    }
    await runWorkflow(options.date ? new Date(options.date) : /* @__PURE__ */ new Date(), config);
  } catch (error) {
    console.log(error);
    logger.error(`Workflow failed: ${error}`);
    process$1.exit(1);
  }
}
void main();
