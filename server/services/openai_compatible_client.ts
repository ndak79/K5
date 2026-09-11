export interface OpenAICompatibleClientOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
}

export interface OpenAICompatibleClient {
  chatJson<T>(
    systemPrompt: string,
    userPrompt: string,
    options?: { responseFormat?: "object" | "none" }
  ): Promise<T>;
}

export const DEFAULT_AI_BASE_URL = "http://localhost:20128/v1";
export const DEFAULT_AI_MODEL = "ag/gemini-3.6-flash-medium";

function getRetryDelay(errorMessage: string, attempt: number): number {
  const retryAfterSeconds = errorMessage.match(/retry(?:-after| in)\s*[: ]?\s*([\d.]+)s?/i)?.[1];
  const parsedSeconds = retryAfterSeconds ? Number.parseFloat(retryAfterSeconds) : Number.NaN;
  if (Number.isFinite(parsedSeconds)) {
    return Math.min(parsedSeconds * 1000, 30_000);
  }
  return Math.min(500 * 2 ** (attempt - 1), 8_000);
}

function getMessageContent(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : part?.text || ""))
      .join("");
  }
  return "";
}

function safeErrorMessage(payload: any, status: number): string {
  const message = payload?.error?.message || payload?.message;
  const detail = typeof message === "string" && message.trim() ? `: ${message.trim()}` : "";
  return `AI request failed with HTTP ${status}${detail}`;
}

export function createOpenAICompatibleClient(
  options?: Partial<OpenAICompatibleClientOptions>
): OpenAICompatibleClient {
  const baseUrl = (options?.baseUrl || process.env.AI_BASE_URL || DEFAULT_AI_BASE_URL).replace(/\/+$/, "");
  const apiKey = options?.apiKey || process.env.AI_API_KEY || "";
  const model = options?.model || process.env.AI_MODEL || DEFAULT_AI_MODEL;
  const fetchImpl = options?.fetchImpl || globalThis.fetch;
  const maxAttempts = options?.maxAttempts ?? 3;

  if (!apiKey) {
    throw new Error("AI_API_KEY is not configured.");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch is not available in the current runtime.");
  }

  return {
    async chatJson<T>(
      systemPrompt: string,
      userPrompt: string,
      requestOptions?: { responseFormat?: "object" | "none" }
    ): Promise<T> {
      const requestBody: Record<string, unknown> = {
        model,
        messages: [
          ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: 4096,
        stream: false
      };
      if (requestOptions?.responseFormat !== "none") {
        requestBody.response_format = { type: "json_object" };
      }
      const body = JSON.stringify(requestBody);

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        let response: Response;
        let payload: any;

        try {
          response = await fetchImpl(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json"
            },
            body
          });
          payload = await response.json().catch(() => null);
        } catch (error) {
          if (attempt >= maxAttempts) {
            throw new Error(`AI request failed: ${error instanceof Error ? error.message : String(error)}`);
          }
          await new Promise((resolve) => setTimeout(resolve, getRetryDelay(String(error), attempt)));
          continue;
        }

        if (response.ok) {
          const content = getMessageContent(payload).trim();
          if (!content) {
            throw new Error("AI response did not contain message content.");
          }
          try {
            return JSON.parse(content) as T;
          } catch (error) {
            throw new Error(`AI response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        const errorMessage = safeErrorMessage(payload, response.status);
        const isRetryable = response.status === 408 || response.status === 429 || response.status >= 500;
        if (!isRetryable || attempt >= maxAttempts) {
          throw new Error(errorMessage);
        }
        await new Promise((resolve) => setTimeout(resolve, getRetryDelay(errorMessage, attempt)));
      }

      throw new Error("AI request failed after retry attempts.");
    }
  };
}
