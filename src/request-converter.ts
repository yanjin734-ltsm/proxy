import { PerplexityAuth } from "./auth-extractor.js";

export interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface OpenAIChatRequest {
  model: string;
  messages: OpenAIMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description?: string;
      parameters?: Record<string, unknown>;
    };
  }>;
}

export interface OpenAIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message?: {
      role: string;
      content: string;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    delta?: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface PerplexityMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface PerplexityChatRequest {
  model: string;
  messages: PerplexityMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

/**
 * Convert OpenAI request to Perplexity format
 */
export function convertOpenAIToPerplexity(request: OpenAIChatRequest): PerplexityChatRequest {
  const messages: PerplexityMessage[] = request.messages.map((msg) => {
    if (msg.role === "tool") {
      // Convert tool messages to user messages
      return {
        role: "user",
        content: `Tool result (${msg.name || msg.tool_call_id}): ${msg.content}`,
      };
    }
    return {
      role: msg.role,
      content: msg.content,
    };
  });

  return {
    model: request.model,
    messages,
    stream: request.stream ?? false,
    temperature: request.temperature,
    max_tokens: request.max_tokens,
  };
}

/**
 * Convert Perplexity SSE chunk to OpenAI format
 */
export function convertPerplexityToOpenAI(
  perplexityChunk: string,
  model: string,
  requestId: string
): OpenAIChatResponse | null {
  try {
    const data = JSON.parse(perplexityChunk);

    if (data.type === "answer") {
      return {
        id: requestId,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            delta: {
              content: data.content || "",
            },
            finish_reason: null,
          },
        ],
      };
    }

    if (data.type === "done") {
      return {
        id: requestId,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: "stop",
          },
        ],
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Create complete OpenAI response from Perplexity response
 */
export function createOpenAIResponse(
  content: string,
  model: string,
  requestId: string
): OpenAIChatResponse {
  return {
    id: requestId,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}
