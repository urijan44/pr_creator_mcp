import { z } from "zod";
import { execSync } from "child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

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
        const message = [
            `The following is a git diff.`,
            `Please generate a pull request title, description, checklist of things to test, and list of affected areas.\n`,
            diff
          ].join("\n");

        return {
            content: [  
                {
                    type: "text",
                    text: "message"
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