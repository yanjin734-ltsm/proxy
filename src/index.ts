import { createProxyServer } from "./proxy-server.js";

async function main() {
  console.log("Starting Perplexity OpenCode Proxy...\n");

  try {
    const server = await createProxyServer();
    server.start();
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

main();
