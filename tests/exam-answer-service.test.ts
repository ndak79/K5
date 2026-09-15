import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  extractClosFromCdrDocx,
  extractQuestionsFromDocx,
  findRelevantGtContext,
  generateAnswerForQuestion,
  compileExamAnswersDocx,
  examAnswerRuntime,
  resetExamAnswerRuntime,
  getExamAnswerSummary
} from "../server/services/exam_answer_service";
import { parseGtDocument } from "../server/document_pipeline/parse_gt";

test("extracts CLOs correctly from CDR document", () => {
  const cdrPath = path.resolve("CDR.docx");
  if (!fs.existsSync(cdrPath)) return;

  const clos = extractClosFromCdrDocx(cdrPath);
  assert.ok(clos.length >= 4, "Expected at least 4 CLOs");
  assert.ok(clos.some((c) => c.code === "1.1"), "Expected CLO 1.1");
  assert.ok(clos.some((c) => c.code === "2.2"), "Expected CLO 2.2");
});

test("extracts questions correctly from Question docx", () => {
  const qPath = path.resolve("Cau hoi on tap GDHQS.docx");
  if (!fs.existsSync(qPath)) return;

  const questions = extractQuestionsFromDocx(qPath);
  assert.equal(questions.length, 30, "Expected 30 questions from Cau hoi on tap GDHQS.docx");
  assert.equal(questions[0].number, 1);
  assert.match(questions[0].question, /đặc trưng của quá trình sư phạm quân sự/i);
  assert.equal(questions[29].number, 30);
});

test("finds relevant GT chapter context for a given question", () => {
  const gtPath = path.resolve("GT.docx");
  if (!fs.existsSync(gtPath)) return;

  const parsedGt = parseGtDocument(gtPath);
  const context = findRelevantGtContext("Phân tích các đặc trưng của quá trình sư phạm quân sự", parsedGt);
  assert.ok(context.length > 100);
  assert.match(context, /GIÁO TRÌNH THAM KHẢO/);
});

test("generates structured answer with 5,0đ scale and exports docx", async () => {
  resetExamAnswerRuntime();
  examAnswerRuntime.questions = [
    {
      number: 1,
      question: "Phân tích các đặc trưng của quá trình sư phạm quân sự. Ý nghĩa vận dụng đối với người cán bộ phân đội để nâng cao hiệu quả quá trình sư phạm ở đơn vị hiện nay.",
      status: "idle",
      error: null,
      answer: null
    }
  ];
  examAnswerRuntime.clos = [
    { code: "1.1", text: "Phẩm chất chính trị" },
    { code: "2.1", text: "Kiến thức lý luận" }
  ];

  const answer = await generateAnswerForQuestion(1);
  assert.ok(answer);
  assert.equal(answer.totalScore, "5,0đ");
  assert.equal(answer.introduction.score, "0,25đ");
  assert.equal(answer.part1.score, "2,5đ");
  assert.equal(answer.part2.score, "2,0đ");
  assert.equal(answer.conclusion.score, "0,25đ");
  assert.ok(answer.part1.items.length >= 2);
  assert.ok(answer.part2.items.length >= 2);

  const tempOutput = path.join(os.tmpdir(), `test_compile_exam_${Date.now()}.docx`);
  try {
    compileExamAnswersDocx(tempOutput);
    assert.ok(fs.existsSync(tempOutput));
  } finally {
    if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
  }
});
