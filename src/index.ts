import dotenv from "dotenv";
dotenv.config();
import fetch from "node-fetch"; // if using node-fetch for HTTP requests
import { z } from "zod";
import { execSync } from "child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  writeLog,
  extractTicketTag,
  getRepoInfo,
  getGitDiff,
  getGitUser,
  loadPRTemplate,
} from "./helper.js";
const githubApiBase = process.env.GITHUB_API_BASE ?? "https://api.github.com";
const githubWebBase = process.env.GITHUB_WEB_BASE ?? "https://github.com";

const server = new McpServer({
  name: "pr-writer",
  version: "0.0.1",
});

server.tool(
  "pr-creator",
  "Analyzes Git changes and automatically generates a pull request title and description",
  {
    workingDir: z
      .string()
      .describe("Path to the working Git directory"),
    baseBranch: z
      .string()
      .default("main")
      .describe("The base branch to compare against"),
  },
  async ({ baseBranch, workingDir }) => {
    const headBranch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: workingDir,
      encoding: "utf-8",
    }).trim();

    const diff = getGitDiff(baseBranch, headBranch, workingDir);
    const ticketTag = extractTicketTag(headBranch);
    const template = loadPRTemplate(workingDir);
    const commitsRaw = execSync(
      `git log ${baseBranch}..${headBranch} --pretty=format:"%h %s"`,
      {
        cwd: workingDir,
        encoding: "utf-8",
      }
    );

    const { owner, repo } = getRepoInfo(workingDir);
    writeLog(`commitsRaw: ${commitsRaw}`, "pr-writer");
    const commitLines = commitsRaw
      .split("\n")
      .map((line) => {
        const [hash, ...msgParts] = line.split(" ");
        const msg = msgParts.join(" ");
        const url = `${githubWebBase}/${owner}/${repo}/commit/${hash}`;
        return `- [${hash}](${url}) ${msg}`;
      })
      .join("\n");
    const message = [
      `You are about to generate a pull request based on the following Git diff.`,
    `Please create a draft pull request title and description. Include a summary of the recent commits in the description.`,
      `Make sure to include a checklist of items to test and a list of affected areas.`,
      ticketTag
        ? `The current branch is "${headBranch}", which includes a ticket ID: "${ticketTag}". Please format the pull request title as: [${ticketTag}] Your title here.`
        : `If the current branch contains a ticket ID (e.g. "TICKET-123"), format the title like: [TICKET-123] Your title here.`,
      template
        ? `\n---\nPlease follow this PR template:\n\n${template}\n---\n`
        : "",
      `Please summarize the recent commits section into the body of the pull request.`,
      `\n## Recent Commits\n\n${commitLines}\n`,
      `Present the result in a way that the user can review and optionally revise before submitting.`,
      `Ask the user: "Would you like to proceed with this pull request as written, or make some changes?"`,
      diff,
    ].join("\n");

    writeLog(message, "pr-writer");
    return {
      content: [
        {
          type: "text",
          text: message,
        },
      ],
    };
  }
);

server.tool(
  "pr-submitter",
  "Submits a pull request to the remote repository",
  {
    workingDir: z
      .string()
      .describe("Path to the working Git directory"),
    baseBranch: z
      .string()
      .describe("The branch you want to merge into (e.g. 'main')"),
    headBranch: z
      .string()
      .describe(
        "The branch you want to merge from (e.g. 'feature/TICKET-123')"
      ),
    title: z.string().describe("Title of the pull request"),
    body: z.string().describe("Body/description of the pull request"),
    reviewers: z
      .array(z.string())
      .optional()
      .describe("GitHub usernames to assign as reviewers"),
  },
  async ({ workingDir, baseBranch, headBranch, title, body, reviewers }) => {
    type GithubPRResponse = {
      html_url: string;
      [key: string]: any;
    };
    try {
      const pushResult = execSync(`git push -u origin ${headBranch}`, {
        cwd: workingDir,
        encoding: "utf-8",
      });
      writeLog(`✅ Branch pushed successfully:\n${pushResult}`, "pr-submitter");

      const { owner, repo } = getRepoInfo(workingDir);
      const githubToken = process.env.GITHUB_TOKEN;

      if (!githubToken) {
        return {
          content: [
            {
              type: "text",
              text: "❌ GITHUB_TOKEN is not set in environment variables.",
            },
          ],
        };
      }

      try {
        const url = `${githubApiBase}/repos/${owner}/${repo}/pulls`;
        writeLog(`Creating pull request...${url}`, "pr-submitter");
        const user = getGitUser(workingDir);

        // Check if a pull request already exists between the same head and base
        const existingPRRes = await fetch(
          `${githubApiBase}/repos/${owner}/${repo}/pulls?head=${owner}:${headBranch}&base=${baseBranch}`,
          {
            headers: {
              Authorization: `Bearer ${githubToken}`,
              Accept: "application/vnd.github+json",
              "User-Agent": "mcp-pr-writer",
            },
          }
        );

        if (!existingPRRes.ok) {
          const errorText = await existingPRRes.text();
          writeLog(
            `❌ Failed to check for existing PR: ${errorText}`,
            "pr-submitter"
          );
        }

        const existingPRs = (await existingPRRes.json()) as any[];
        const existingPR = existingPRs[0];

        if (existingPR) {
          const updateRes = await fetch(
            `${githubApiBase}/repos/${owner}/${repo}/pulls/${existingPR.number}`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${githubToken}`,
                Accept: "application/vnd.github+json",
                "User-Agent": "mcp-pr-writer",
              },
              body: JSON.stringify({ title, body }),
            }
          );

          if (!updateRes.ok) {
            const errorText = await updateRes.text();
            writeLog(
              `❌ Failed to update existing PR: ${errorText}`,
              "pr-submitter"
            );
            return {
              content: [
                {
                  type: "text",
                  text: `❌ Failed to update existing PR.\n\n${errorText}`,
                },
              ],
            };
          } else {
            const updatedPR = (await updateRes.json()) as GithubPRResponse;
            writeLog(`✅ Updated existing PR: ${updatedPR.html_url}`, "pr-submitter");
            return {
              content: [
                {
                  type: "text",
                  text: `✅ Pull request updated: ${updatedPR.html_url}`,
                },
              ],
            };
          }
        }
        // 기존 PR이 없을 때만 아래 코드 실행
        const payload = {
          title,
          head: headBranch,
          base: baseBranch,
          body,
          assignees: [user],
          ...(reviewers ? { reviewers } : {}),
        };
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "mcp-pr-writer",
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errorText = await res.text();
          writeLog(`❌ GitHub PR creation failed: ${errorText}`, "pr-submitter");
          return {
            content: [
              {
                type: "text",
                text: `❌ GitHub PR creation failed.\n\n${errorText}`,
              },
            ],
          };
        } else {
          const prData: GithubPRResponse = (await res.json()) as GithubPRResponse;
          const prUrl = prData.html_url;

          writeLog(`✅ PR created: ${prUrl}`, "pr-submitter");
          return {
            content: [
              {
                type: "text",
                text: `✅ Pull request successfully created: ${prUrl}`,
              },
            ],
          };
        }
      } catch (err: any) {
        writeLog(`❌ GitHub API request failed: ${err.message}`, "pr-submitter");
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to create pull request: ${err.message}`,
            },
          ],
        };
      }
    } catch (error) {
      writeLog(`❌ Error pushing branch:\n${error}`, "pr-submitter");
      return {
        content: [
          {
            type: "text",
            text: `Failed to push branch "${headBranch}" to origin.\n\n${error}`,
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `Branch "${headBranch}" was successfully pushed to origin. Ready to create a pull request!`,
        },
      ],
    };
  }
);

server.tool(
  "get-reviewers",
  "Fetch available reviewers for the repository",
  {
    workingDir: z.string(),
  },
  async ({ workingDir }) => {
    const { owner, repo } = getRepoInfo(workingDir);
    const githubToken = process.env.GITHUB_TOKEN;

    if (!githubToken) {
      return {
        content: [
          {
            type: "text",
            text: "❌ GITHUB_TOKEN is not set in environment variables.",
          },
        ],
      };
    }

    const res = await fetch(
      `${githubApiBase}/repos/${owner}/${repo}/collaborators`,
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "mcp-pr-writer",
        },
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      writeLog(`❌ Reviewer fetch failed: ${errorText}`, "pr-submitter");
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to fetch reviewers.\n\n${errorText}`,
          },
        ],
      };
    }

    const users = (await res.json()) as { login: string }[];
    const reviewers = users.map((u) => `- ${u.login}`).join("\n");

    return {
      content: [
        {
          type: "text",
          text: `The following users can be assigned as reviewers:\n\n${reviewers}\n\nPlease select the reviewers you want to assign to this PR.`,
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP PR writer running...");
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});