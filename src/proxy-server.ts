import { createServer, IncomingMessage, ServerResponse } from "http";
import { AuthExtractor, PerplexityAuth } from "./auth-extractor.js";
import { PerplexityClient } from "./perplexity-client.js";
import { OpenAIChatRequest } from "./request-converter.js";

const PORT = parseInt(process.env.PORT || "8080", 10);
const DEBUG = process.env.DEBUG === "true";

function log(...args: unknown[]) {
  if (DEBUG) {
    console.log("[Proxy]", ...args);
  }
}

export class ProxyServer {
  private authExtractor: AuthExtractor;
  private auth: PerplexityAuth | null = null;
  private client: PerplexityClient | null = null;

  constructor() {
    this.authExtractor = new AuthExtractor(process.env.PERPLEXITY_COOKIE_DB_PATH);
  }

  /**
   * Initialize authentication
   */
  async init(): Promise<boolean> {
    // Try environment variable first
    if (process.env.PERPLEXITY_SESSION_TOKEN) {
      this.auth = {
        sessionToken: process.env.PERPLEXITY_SESSION_TOKEN,
        userId: process.env.PERPLEXITY_USER_ID,
      };
      log("Using session token from environment variable");
    } else {
      // Try to extract from Perplexity desktop app
      this.auth = this.authExtractor.extractAuth();
      if (this.auth) {
        log("Extracted auth from Perplexity desktop app");
      }
    }

    if (!this.auth) {
      console.error("Failed to initialize authentication");
      return false;
    }

    this.client = new PerplexityClient(this.auth);
    return true;
  }

  /**
   * Start the proxy server
   */
  start(): void {
    const server = createServer((req, res) => {
      this.handleRequest(req, res).catch((error) => {
        console.error("Request handler error:", error);
        this.sendError(res, 500, "Internal server error");
      });
    });

    server.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════════════════════════╗
║  Perplexity OpenCode Proxy                                 ║
╠════════════════════════════════════════════════════════════╣
║  Server running on http://localhost:${PORT.toString().padEnd(24)}║
║  Status: ${this.auth ? "Authenticated".padEnd(39) : "Not Authenticated".padEnd(39)}║
╚════════════════════════════════════════════════════════════╝
      `);
    });
  }

  /**
   * Handle incoming HTTP request
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    
    log(`${req.method} ${url.pathname}`);

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    // Health check
    if (url.pathname === "/health" || url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        authenticated: !!this.auth,
        version: "1.0.0",
      }));
      return;
    }

    // List models
    if (url.pathname === "/v1/models" && req.method === "GET") {
      this.handleListModels(res);
      return;
    }

    // Chat completions
    if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
      await this.handleChatCompletions(req, res);
      return;
    }

    // 404 for unknown paths
    this.sendError(res, 404, "Not found");
  }

  /**
   * Handle /v1/models request
   */
  private handleListModels(res: ServerResponse): void {
    const models = [
      {
        id: "perplexity-online",
        object: "model",
        created: 1700000000,
        owned_by: "perplexity",
      },
      {
        id: "perplexity-pro",
        object: "model",
        created: 1700000000,
        owned_by: "perplexity",
      },
    ];

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      object: "list",
      data: models,
    }));
  }

  /**
   * Handle /v1/chat/completions request
   */
  private async handleChatCompletions(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.client) {
      this.sendError(res, 503, "Not authenticated. Please login to Perplexity desktop app first.");
      return;
    }

    const body = await this.readBody(req);
    let request: OpenAIChatRequest;

    try {
      request = JSON.parse(body);
    } catch {
      this.sendError(res, 400, "Invalid JSON");
      return;
    }

    if (request.stream) {
      await this.handleStreamingRequest(request, res);
    } else {
      await this.handleNonStreamingRequest(request, res);
    }
  }

  /**
   * Handle non-streaming chat completion
   */
  private async handleNonStreamingRequest(request: OpenAIChatRequest, res: ServerResponse): Promise<void> {
    try {
      const response = await this.client!.chat(request);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
    } catch (error) {
      console.error("Chat error:", error);
      this.sendError(res, 502, error instanceof Error ? error.message : "Proxy error");
    }
  }

  /**
   * Handle streaming chat completion
   */
  private async handleStreamingRequest(request: OpenAIChatRequest, res: ServerResponse): Promise<void> {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    try {
      for await (const chunk of this.client!.chatStream(request)) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error) {
      console.error("Stream error:", error);
      res.write(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : "Stream error" })}\n\n`);
      res.end();
    }
  }

  /**
   * Read request body
   */
  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", () => resolve(body));
      req.on("error", reject);
    });
  }

  /**
   * Send error response
   */
  private sendError(res: ServerResponse, status: number, message: string): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: {
        message,
        type: "proxy_error",
        code: status,
      },
    }));
  }
}

/**
 * Create and start the proxy server
 */
export async function createProxyServer(): Promise<ProxyServer> {
  const server = new ProxyServer();
  const initialized = await server.init();
  
  if (!initialized) {
    console.warn("Warning: Running without authentication. Some features may not work.");
  }
  
  return server;
}
