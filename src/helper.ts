import fs from "fs";
import path from "path";

export function writeLog(message: string, workingDir: string) {
  const logPath = path.join(workingDir, "mcp-pr.log");
  fs.appendFileSync(logPath, `\n[${new Date().toISOString()}]\n${message}\n`);
}

export function extractTicketTag(branchName: string): string | null {
  const match = branchName.match(/([A-Z]+-\d+)/);
  return match ? match[1] : null;
}
