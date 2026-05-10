import { PerplexityAuth } from "./auth-extractor.js";
import {
  OpenAIChatRequest,
  OpenAIChatResponse,
  convertOpenAIToPerplexity,
  convertPerplexityToOpenAI,
  createOpenAIResponse,
} from "./request-converter.js";

export class PerplexityClient {
  private auth: PerplexityAuth;
  private baseUrl: string;

  constructor(auth: PerplexityAuth) {
    this.auth = auth;
    this.baseUrl = "https://www.perplexity.ai";
  }

  /**
   * Send chat completion request to Perplexity
   */
  async chat(request: OpenAIChatRequest): Promise<OpenAIChatResponse> {
    const perplexityRequest = convertOpenAIToPerplexity(request);
    const requestId = `perplexity-${Date.now()}`;

    if (request.stream) {
      throw new Error("Streaming not supported in non-streaming method. Use chatStream instead.");
    }

    const response = await this.sendRequest(perplexityRequest);
    const content = await this.parseResponse(response);

    return createOpenAIResponse(content, request.model, requestId);
  }

  /**
   * Send streaming chat completion request to Perplexity
   */
  async *chatStream(request: OpenAIChatRequest): AsyncGenerator<OpenAIChatResponse> {
    const perplexityRequest = convertOpenAIToPerplexity(request);
    const requestId = `perplexity-${Date.now()}`;

    const response = await this.sendRequest(perplexityRequest, true);

    if (!response.body) {
      throw new Error("No response body from Perplexity");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              yield {
                id: requestId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model: request.model,
                choices: [
                  {
                    index: 0,
                    delta: {},
                    finish_reason: "stop",
                  },
                ],
              };
              return;
            }

            const converted = convertPerplexityToOpenAI(data, request.model, requestId);
            if (converted) {
              yield converted;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Send request to Perplexity API
   */
  private async sendRequest(
    request: ReturnType<typeof convertOpenAIToPerplexity>,
    stream = false
  ): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": stream ? "text/event-stream" : "application/json",
      "Cookie": `__Secure-next-auth.session-token=${this.auth.sessionToken}`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": "https://www.perplexity.ai/",
      "Origin": "https://www.perplexity.ai",
    };

    if (this.auth.csrfToken) {
      headers["X-CSRF-Token"] = this.auth.csrfToken;
    }

    const response = await fetch(`${this.baseUrl}/rest/sse/perplexity_ask`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...request,
        source: "default",
        version: "2.13",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Perplexity API error: ${response.status} - ${errorText}`);
    }

    return response;
  }

  /**
   * Parse non-streaming response from Perplexity
   */
  private async parseResponse(response: Response): Promise<string> {
    const text = await response.text();
    const lines = text.split("\n");
    let content = "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") break;

        try {
          const parsed = JSON.parse(data);
          if (parsed.type === "answer" && parsed.content) {
            content += parsed.content;
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    return content;
  }
}
