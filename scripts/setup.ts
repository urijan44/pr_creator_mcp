import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const mcpPath = path.join(os.homedir(), ".cursor", "mcp.json");
const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const entryPoint = path.join(projectRoot, "build/index.js");
const tag = "pr-write";

const config = fs.existsSync(mcpPath)
  ? JSON.parse(fs.readFileSync(mcpPath, "utf-8"))
  : { mcpServers: {} };

config.mcpServers[tag] = {
  command: "node",
  args: [entryPoint],
  env: {
    GITHUB_TOKEN: "your-token-here",
    GITHUB_API_BASE: "https://api.github.com",
    GITHUB_WEB_BASE: "https://github.com"
  }
};

fs.mkdirSync(path.dirname(mcpPath), { recursive: true });
fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2));
console.log(`✅ MCP config updated at ${mcpPath}`);
