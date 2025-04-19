import fs from "fs";
import path from "path";
import { execSync } from "child_process";

export function writeLog(message: string, workingDir: string) {
  const logPath = path.join(workingDir, "mcp-pr.log");
  fs.appendFileSync(logPath, `\n[${new Date().toISOString()}]\n${message}\n`);
}

export function extractTicketTag(branchName: string): string | null {
  const match = branchName.match(/([A-Z]+-\d+)/);
  return match ? match[1] : null;
}

export function getRepoInfo(cwd: string): { owner: string; repo: string } {
  const remoteUrl = execSync("git remote get-url origin", {
    cwd: cwd,
    encoding: "utf-8",
  }).trim();
  // git@github.com:user/repo.git
  writeLog(`getRepoInfo: ${remoteUrl}`, cwd);
  let match = remoteUrl.match(/git@[^:]+:([^/]+)\/([^.]+)(\.git)?$/);
  if (!match) {
    writeLog(`getRepoInfo: no match`, cwd);
    // https://github.com/user/repo.git
    match = remoteUrl.match(/https:\/\/[^/]+\/([^/]+)\/([^.]+)(\.git)?$/);
  }

  if (!match) {
    throw new Error(`Invalid or unsupported remote URL format: ${remoteUrl}`);
  }

  return { owner: match[1], repo: match[2] };
}

export function getGitDiff(
  baseBranch: string,
  headBranch: string,
  workingDir: string
): string {
  const diff = execSync(`git diff ${baseBranch}...${headBranch}`, {
    cwd: workingDir,
    encoding: "utf-8",
  });
  return diff.trim();
}

// Additional logic for PR submission
export function getGitUser(workingDir: string): string {
  const gitUser = execSync("git config user.name", {
    cwd: workingDir,
    encoding: "utf-8",
  }).trim();
  writeLog(`getGitUser: ${gitUser}`, workingDir);
  return gitUser;
}

export function loadPRTemplate(workingDir: string): string | null {
    const possiblePaths = [
        path.join(workingDir, ".github", "PULL_REQUEST_TEMPLATE.md"),
        path.join(workingDir, "PULL_REQUEST_TEMPLATE.md")
    ];
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return fs.readFileSync(p, "utf-8");
        }
    }
    return null;
}

