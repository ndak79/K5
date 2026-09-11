import assert from "node:assert/strict";
import test from "node:test";
import { createOpenAICompatibleClient } from "../server/services/openai_compatible_client";

test("sends OpenAI-compatible chat requests to the configured model", async () => {
  let request: { url: string; init: RequestInit } | null = null;
  const client = createOpenAICompatibleClient({
    baseUrl: "http://localhost:20128/v1",
    apiKey: "test-secret-key",
    model: "ag/gemini-3.6-flash-medium",
    fetchImpl: async (url, init) => {
      request = { url: String(url), init };
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  const result = await client.chatJson<{ ok: boolean }>("system prompt", "user prompt");
  assert.deepEqual(result, { ok: true });
  assert.ok(request);
  assert.equal(request.url, "http://localhost:20128/v1/chat/completions");
  assert.equal((request.init.headers as Record<string, string>).Authorization, "Bearer test-secret-key");
  const body = JSON.parse(String(request.init.body));
  assert.equal(body.model, "ag/gemini-3.6-flash-medium");
  assert.deepEqual(body.messages, [
    { role: "system", content: "system prompt" },
    { role: "user", content: "user prompt" }
  ]);
  assert.deepEqual(body.response_format, { type: "json_object" });
});
