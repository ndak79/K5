import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createOpenAICompatibleClient } from "../server/services/openai_compatible_client";

test("AI requests explicitly disable streaming for Bloom JSON parsing", async () => {
  let requestBody: any = null;
  const client = createOpenAICompatibleClient({
    baseUrl: "http://localhost:20128/v1",
    apiKey: "test-key",
    model: "ag/gemini-3.6-flash-medium",
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });

  await client.chatJson("system", "user");
  assert.equal(requestBody.stream, false);
});

test("AI authentication failures are explicit and are not retried", async () => {
  let attempts = 0;
  const client = createOpenAICompatibleClient({
    baseUrl: "http://localhost:20128/v1",
    apiKey: "invalid-key",
    model: "ag/gemini-3.6-flash-medium",
    fetchImpl: async () => {
      attempts++;
      return new Response(JSON.stringify({ error: { message: "Invalid API key" } }), {
        status: 401,
        headers: { "content-type": "application/json" }
      });
    }
  });

  await assert.rejects(() => client.chatJson("system", "user"), /HTTP 401.*Invalid API key/);
  assert.equal(attempts, 1);
});

test("Bloom errors no longer identify the OpenAI-compatible provider as Gemini", () => {
  const source = fs.readFileSync("server/services/bloom_service.ts", "utf8");
  assert.equal(source.includes("Gemini"), false);
  assert.equal(source.includes("GEMINI"), false);
});
