import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
    name: "pr-writer",
    version: "0.0.1"
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MCP PR writer running...");
}

main().catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);

});