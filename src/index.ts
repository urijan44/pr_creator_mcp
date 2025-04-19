import { z } from "zod";
import { execSync } from "child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { writeLog, extractTicketTag } from "./helper.js";

const server = new McpServer({
    name: "pr-writer",
    version: "0.0.1"
});

function getGitDiff(baseBranch: string, headBranch: string, workingDir: string): string {
    const diff = execSync(`git diff ${baseBranch}...${headBranch}`, {
        cwd: workingDir,
        encoding: "utf-8"
    });
    return diff.trim();
  }

server.tool(
    "pr-creator",
    "Analyzes Git changes and automatically generates a pull request title and description",
    {
        workingDir: z.string().default(".").describe("Path to the working Git directory"),
        baseBranch: z.string().default("main").describe("The base branch to compare against"),
    },
    async ({  baseBranch, workingDir }) => {
        const headBranch = execSync("git rev-parse --abbrev-ref HEAD", {
            cwd: workingDir,
            encoding: "utf-8"
        }).trim();

        const diff = getGitDiff(baseBranch, headBranch, workingDir);
        const ticketTag = extractTicketTag(headBranch);
        const message = [
            `You are about to generate a pull request based on the following Git diff.`,
            `Please create a draft pull request title and description.`,
            `Make sure to include a checklist of items to test and a list of affected areas.`,
            ticketTag
            ? `The current branch is "${headBranch}", which includes a ticket ID: "${ticketTag}". Please format the pull request title as: [${ticketTag}] Your title here.`
            : `If the current branch contains a ticket ID (e.g. "TICKET-123"), format the title like: [TICKET-123] Your title here.`,
            `Present the result in a way that the user can review and optionally revise before submitting.`,
            `Ask the user: "Would you like to proceed with this pull request as written, or make some changes?"`,
            diff
          ].join("\n");

        writeLog(message, workingDir);
        return {
            content: [  
                {
                    type: "text",
                    text: message
                }
            ]
        };
    }
)

server.tool(
    "pr-submitter",
    "Submits a pull request to the remote repository",
    {
        workingDir: z.string().default(".").describe("Path to the working Git directory"),
        baseBranch: z.string().describe("The branch you want to merge into (e.g. 'main')"),
        headBranch: z.string().describe("The branch you want to merge from (e.g. 'feature/TICKET-123')"),
        title: z.string().describe("Title of the pull request"),
        body: z.string().describe("Body/description of the pull request")
    },
    async ({ workingDir, baseBranch, headBranch, title, body }) => {
        const message = [
            `You are about to submit a pull request to the remote repository.`,
            `Please confirm the pull request title and description.`,
            `Make sure to include a checklist of items to test and a list of affected areas.`,
        ].join("\n");

        try {
            const pushResult = execSync(`git push -u origin ${headBranch}`, {
                cwd: workingDir,
                encoding: "utf-8"
            });
            writeLog(`✅ Branch pushed successfully:\n${pushResult}`, workingDir)
        } catch (error) {
            writeLog(`❌ Error pushing branch:\n${error}`, workingDir)
            return {
                content: [
                    {
                        type: "text",
                        text: `Failed to push branch "${headBranch}" to origin.\n\n${error}`
                    }
                ]
            }
        }
        return {
            content: [
              {
                type: "text",
                text: `Branch "${headBranch}" was successfully pushed to origin. Ready to create a pull request!`
              }
            ]
          };
    }
)

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MCP PR writer running...");
}

main().catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
});