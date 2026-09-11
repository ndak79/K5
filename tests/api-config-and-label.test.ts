import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("contains the requested AI defaults and UI label", () => {
  const clientSource = fs.readFileSync("server/services/openai_compatible_client.ts", "utf8");
  const pageSource = fs.readFileSync("src/pages/upload-page.tsx", "utf8");

  assert.match(clientSource, /http:\/\/localhost:20128\/v1/);
  assert.match(clientSource, /ag\/gemini-3\.6-flash-medium/);
  assert.equal((pageSource.match(/Chuẩn hóa bài giảng các môn KHXH&NV/g) || []).length, 1);
  assert.equal((pageSource.match(/Chuẩn hóa cấu trúc khung bài giảng kỹ thuật số/g) || []).length, 0);
});
