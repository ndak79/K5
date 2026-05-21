import { GoogleGenAI } from "@google/genai";
import { BlockNode, OutlineNode, ParsedGtChapter, normalizeTextKey } from "../document_pipeline/parse_gt";
import { Anchor } from "./anchor_locator";
import { LessonDocumentModel, GeneratedInsertion } from "./normalizer";
import { buildLessonContext, LessonContextPayload } from "./lesson_context_builder";
import { inheritStyle, buildInsertedParagraphXml } from "./style_inheritance";
import {
  buildQuestionPlannerPrompt,
  buildMethodPlannerPrompt,
  buildQuestionGeneratorPrompt,
  buildMethodGeneratorPrompt,
  buildQuestionReviewerPrompt,
  buildMethodReviewerPrompt,
  PromptPackage
} from "./prompt_builder";

export const ALLOWED_METHODS = [
  "Thao luan nhom",
  "Lop hoc dao nguoc",
  "Neu van de",
  "Huong dan nghien cuu"
];

export const METHOD_DISPLAY_LABELS: Record<string, string> = {
  "Thao luan nhom": "Thảo luận nhóm",
  "Lop hoc dao nguoc": "Lớp học đảo ngược",
  "Neu van de": "Nêu vấn đề",
  "Huong dan nghien cuu": "Hướng dẫn nghiên cứu"
};

export const CONTENT_TYPE_SIGNAL_RULES: Record<string, string[]> = {
  "khai-niem-ban-chat": [
    "khai niem",
    "ban chat",
    "nguyen tac",
    "noi dung co ban",
    "dac diem co ban",
    "co so ly luan"
  ],
  "quy-trinh-yeu-cau": [
    "yeu cau",
    "quy trinh",
    "cach thuc",
    "duoc thuc hien",
    "duoc tien hanh",
    "cac buoc",
    "trinh tu"
  ],
  "van-de-tinh-huong": [
    "tinh huong",
    "van de",
    "mau thuan",
    "tai sao",
    "xu ly",
    "giai quyet"
  ],
  "nghien-cuu-tai-lieu": [
    "nghien cuu",
    "tai lieu",
    "doc truoc",
    "tu hoc",
    "tong hop",
    "thu thap thong tin"
  ]
};

export const METHOD_POSITIVE_SIGNAL_RULES: Record<string, string[]> = {
  "Huong dan nghien cuu": [
    "nghien cuu",
    "tai lieu",
    "doc truoc",
    "tu hoc",
    "tong hop",
    "bao cao",
    "doi chieu"
  ],
  "Neu van de": [
    "van de",
    "tinh huong",
    "mau thuan",
    "tai sao",
    "xu ly",
    "giai quyet",
    "de xuat"
  ],
  "Thao luan nhom": [
    "thao luan",
    "trao doi",
    "so sanh",
    "doi chieu",
    "phan tich",
    "lap luan",
    "bao cao nhom"
  ],
  "Lop hoc dao nguoc": [
    "chuan bi truoc",
    "xem truoc",
    "doc truoc",
    "tu hoc truoc",
    "bao cao",
    "thuyet trinh ngan"
  ]
};

export const METHOD_NEGATIVE_SIGNAL_RULES: Record<string, string[]> = {
  "Huong dan nghien cuu": ["thao tac ngay", "thuc hanh nhanh", "hoi dap ngan"],
  "Neu van de": ["liet ke khai niem", "trinh bay dinh nghia thuan tuy"],
  "Thao luan nhom": ["khai niem don le", "dinh nghia ngan gon"],
  "Lop hoc dao nguoc": ["khong can chuan bi truoc", "gioi thieu mo dau ngan"]
};

export interface QuestionPayload {
  question: string;
  answer: string;
  difficulty?: string;
}

export interface EnrichmentPayload {
  recommended_methods: string[];
  questions: QuestionPayload[];
  source?: string;
}

export interface LessonEnrichmentResponse {
  lesson_id: string;
  insertions: GeneratedInsertion[];
  source: string;
}

let aiClient: GoogleGenAI | null = null;
function getAi(): GoogleGenAI | null {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (key) {
      aiClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });
    }
  }
  return aiClient;
}

async function callGeminiJson<T>(promptPackage: PromptPackage): Promise<T | null> {
  const ai = getAi();
  if (!ai) return null;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: promptPackage.user,
      config: {
        systemInstruction: promptPackage.system,
        responseMimeType: "application/json"
      }
    });

    const text = response.text || "";
    return JSON.parse(text.trim()) as T;
  } catch (err) {
    console.warn("Gemini generation failed or format is invalid. Error:", err);
    return null;
  }
}

function deduplicateQuestions(questions: QuestionPayload[]): QuestionPayload[] {
  const seen = new Set<string>();
  const unique: QuestionPayload[] = [];
  for (const q of questions) {
    const norm = normalizeTextKey(q.question);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    unique.push(q);
  }
  return unique;
}

function normalizeDifficulty(value: string): string {
  const lowered = value.toLowerCase().trim();
  if (lowered.includes("basic") || lowered.includes("co ban")) {
    return "basic";
  }
  if (lowered.includes("applied") || lowered.includes("van dung") || lowered.includes("difficult")) {
    return "applied";
  }
  return "basic";
}

function findOutlineForAnchor(lesson: LessonDocumentModel, anchor: Anchor): OutlineNode | null {
  if (anchor.outline_id) {
    return lesson.gt_chapter.outline.find((o) => o.id === anchor.outline_id) || null;
  }
  if (!anchor.block_id) return null;
  return lesson.gt_chapter.outline.find((o) => o.block_id === anchor.block_id) || null;
}

function findBlockIndex(blocks: BlockNode[], blockId: string | null): number | null {
  if (!blockId) return null;
  const idx = blocks.findIndex((b) => b.id === blockId);
  return idx === -1 ? null : idx;
}

function findOutlineIndex(lesson: LessonDocumentModel, outlineId: string): number | null {
  const idx = lesson.gt_chapter.outline.findIndex((o) => o.id === outlineId);
  return idx === -1 ? null : idx;
}

function cleanAnchorTitle(anchor: Anchor): string {
  return anchor.label.replace(/^Q\/A targets cho\s+/i, "").replace(/^Q\/A planned cho\s+/i, "").trim();
}

function sectionBlocksForOutline(lesson: LessonDocumentModel, outline: OutlineNode): BlockNode[] {
  const blocks = lesson.part_two_blocks;
  const outlines = lesson.gt_chapter.outline;
  const outlineIndex = findOutlineIndex(lesson, outline.id);
  const startIndex = findBlockIndex(blocks, outline.block_id);

  if (outlineIndex === null || startIndex === null) {
    return [];
  }

  let endIndex = blocks.length;
  for (let i = outlineIndex + 1; i < outlines.length; i++) {
    const candidate = outlines[i];
    const candidateBlockIndex = findBlockIndex(blocks, candidate.block_id);
    if (candidateBlockIndex === null) continue;
    if (candidate.level <= outline.level) {
      endIndex = candidateBlockIndex;
      break;
    }
  }

  return blocks.slice(startIndex, endIndex);
}

function contentBlocksForOutline(lesson: LessonDocumentModel, outline: OutlineNode): BlockNode[] {
  const list = sectionBlocksForOutline(lesson, outline);
  const headingsSet = new Set(lesson.gt_chapter.outline.map((o) => o.block_id).filter(Boolean));
  return list.filter((b) => b.kind === "paragraph" && b.text_preview.trim().length > 0 && !headingsSet.has(b.id));
}

function resolveDurationText(lesson: LessonDocumentModel, anchor: Anchor): string {
  const outline = findOutlineForAnchor(lesson, anchor);
  if (!outline) return "";
  const match = outline.normalized_title.match(/^([I|V|X|L|C]+|\d+)\s*\.?\s*(.+)$/i);
  if (!match) return "";
  const headerSymbol = match[1].trim();

  const item = lesson.cdr_lesson.schedule_items.find(
    (si) => si.section_code && outline.normalized_title.startsWith(`${si.section_code}.`)
  );
  if (!item || !item.duration_minutes) return "";

  const formattedSymbol = /^[IVXLC]+$/i.test(headerSymbol) ? `Phần ${headerSymbol}` : `Mục ${headerSymbol}`;
  return `${formattedSymbol} giảng dạy trong ${item.duration_minutes} phút.`;
}

function questionContextLines(lesson: LessonDocumentModel, anchor: Anchor, limit = 6): string[] {
  const outline = findOutlineForAnchor(lesson, anchor);
  if (!outline) {
    const blockIdx = findBlockIndex(lesson.part_two_blocks, anchor.block_id);
    if (blockIdx === null) return [];
    return lesson.part_two_blocks
      .slice(blockIdx, blockIdx + limit)
      .map((b) => b.text_preview)
      .filter(Boolean);
  }

  return contentBlocksForOutline(lesson, outline)
    .slice(0, limit)
    .map((b) => b.text_preview)
    .filter(Boolean);
}

function allocateQuestionReferenceBlocks(
  lesson: LessonDocumentModel,
  anchor: Anchor,
  questionCount: number,
  fallbackBlock: BlockNode | null
): Array<BlockNode | null> {
  if (questionCount <= 0) return [];
  const outline = findOutlineForAnchor(lesson, anchor);
  if (!outline) {
    return Array(questionCount).fill(fallbackBlock);
  }

  const contentBlocks = contentBlocksForOutline(lesson, outline);
  if (contentBlocks.length === 0) {
    return Array(questionCount).fill(fallbackBlock);
  }

  const blockById: Record<string, BlockNode> = {};
  contentBlocks.forEach((b) => {
    blockById[b.id] = b;
  });

  const distributedPool = contentBlocks.length > 2 ? contentBlocks.slice(1) : contentBlocks;
  const distributedBlockIds = pickDistributedBlockIds(
    distributedPool.map((b) => b.id),
    questionCount
  );

  let primaryBlock: BlockNode | null = null;
  if (questionCount === 1 && distributedBlockIds.length > 0) {
    primaryBlock = blockById[distributedBlockIds[0]] || null;
  } else {
    for (const bId of anchor.evidence_block_ids || []) {
      const b = blockById[bId];
      if (b) {
        primaryBlock = b;
        break;
      }
    }
  }

  if (!primaryBlock) {
    primaryBlock = distributedBlockIds.length > 0 ? blockById[distributedBlockIds[0]] : contentBlocks[0];
  }
  if (!primaryBlock) {
    return Array(questionCount).fill(fallbackBlock);
  }

  const chosenBlocks: BlockNode[] = [primaryBlock];
  const tailBlocks = contentBlocks.filter((b) => b.order_index > primaryBlock!.order_index);
  const tailDistributedIds = pickDistributedBlockIds(
    tailBlocks.map((b) => b.id),
    Math.max(questionCount - 1, 0)
  );

  for (const bId of tailDistributedIds) {
    const b = blockById[bId];
    if (b && !chosenBlocks.some((c) => c.id === b.id)) {
      chosenBlocks.push(b);
      if (chosenBlocks.length >= questionCount) return chosenBlocks;
    }
  }

  for (const bId of distributedBlockIds) {
    const b = blockById[bId];
    if (b && !chosenBlocks.some((c) => c.id === b.id)) {
      chosenBlocks.push(b);
      if (chosenBlocks.length >= questionCount) return chosenBlocks;
    }
  }

  for (const b of contentBlocks) {
    if (!chosenBlocks.some((c) => c.id === b.id)) {
      chosenBlocks.push(b);
      if (chosenBlocks.length >= questionCount) return chosenBlocks;
    }
  }

  if (chosenBlocks.length === 1) {
    return Array(questionCount).fill(chosenBlocks[0]);
  }

  const padded = [...chosenBlocks];
  while (padded.length < questionCount) {
    padded.push(chosenBlocks[chosenBlocks.length - 1]);
  }
  return padded;
}

function pickDistributedBlockIds(bodyBlockIds: string[], slotCount: number): string[] {
  if (bodyBlockIds.length === 0 || slotCount <= 0) return [];
  if (bodyBlockIds.length <= slotCount) return [...bodyBlockIds];

  const indices: number[] = [];
  const denominator = slotCount - 1 || 1;
  for (let idx = 0; idx < slotCount; idx++) {
    const ratio = idx / denominator;
    const index = Math.round(ratio * (bodyBlockIds.length - 1));
    if (!indices.includes(index)) {
      indices.push(index);
    }
  }

  while (indices.length < slotCount) {
    for (let i = 0; i < bodyBlockIds.length; i++) {
      if (!indices.includes(i)) {
        indices.push(i);
        break;
      }
    }
  }

  indices.sort((a, b) => a - b);
  return indices.map((i) => bodyBlockIds[i]);
}

function buildQuestionFromSentence(sentence: string, title: string): string | null {
  const stripped = sentence.replace(/^[-;:]+/, "").trim();
  if (!stripped) return null;

  const roleMatch =
    stripped.match(/(.{3,140}?)\s+với tư cách\s+là\s+/i) || stripped.match(/(.{3,140}?)\s+voi tu cach\s+la\s+/i);
  const purposeMatch =
    stripped.match(/Mục đích chính của (.{3,140}?) không phải chỉ là/i) ||
    stripped.match(/Muc dich chinh cua (.{3,140}?) khong phai chi la/i);
  const centralMatch = stripped.match(/(.{3,140}?)\s+chính là\s+/i) || stripped.match(/(.{3,140}?)\s+chinh la\s+/i);
  const definitionMatch = stripped.match(/(.{3,140}?)\s+(?:cũng\s+)?là\s+/i) || stripped.match(/(.{3,140}?)\s+(?:cung\s+)?la\s+/i);
  const includesMatch = stripped.match(/(.{3,140}?)\s+bao gồm\s+/i) || stripped.match(/(.{3,140}?)\s+bao gom\s+/i);
  const clarifyMatch = stripped.match(/(.{3,140}?)\s+chỉ rõ[:：]?\s+/i) || stripped.match(/(.{3,140}?)\s+chi ro[:ï¼š]?\s+/i);
  const requireMatch = stripped.match(/(.{3,140}?)\s+đòi hỏi\s+/i) || stripped.match(/(.{3,140}?)\s+doi hoi\s+/i);
  const reflectMatch = stripped.match(/(.{3,140}?)\s+phản ánh\s+/i) || stripped.match(/(.{3,140}?)\s+phan anh\s+/i);
  const relationMatch =
    stripped.match(/(.{3,140}?)\s+có mối quan hệ\s+/i) || stripped.match(/(.{3,140}?)\s+co moi quan he\s+/i);
  const processMatch =
    stripped.match(/(.{3,140}?)\s+được\s+tiến hành\s+/i) || stripped.match(/(.{3,140}?)\s+duoc\s+tien hanh\s+/i);
  const actionMatch =
    stripped.match(/(.{3,140}?)\s+được\s+thực hiện\s+/i) || stripped.match(/(.{3,140}?)\s+duoc\s+thuc hien\s+/i);

  if (roleMatch) return `${resolveQuestionSubject(roleMatch[1], title)} giữ vai trò gì?`;
  if (purposeMatch) return `Mục đích chính của ${resolveQuestionSubject(purposeMatch[1], title)} là gì?`;
  if (centralMatch) return `${resolveQuestionSubject(centralMatch[1], title)} là gì?`;
  if (definitionMatch) return `${resolveQuestionSubject(definitionMatch[1], title)} là gì?`;
  if (includesMatch) return `${resolveQuestionSubject(includesMatch[1], title)} bao gồm những nội dung nào?`;
  if (clarifyMatch) return `${resolveQuestionSubject(clarifyMatch[1], title)} chỉ rõ yêu cầu gì?`;
  if (requireMatch) return `${resolveQuestionSubject(requireMatch[1], title)} đòi hỏi điều gì?`;
  if (reflectMatch) return `${resolveQuestionSubject(reflectMatch[1], title)} phản ánh nội dung gì?`;
  if (relationMatch) return `${resolveQuestionSubject(relationMatch[1], title)} có mối quan hệ như thế nào với các nhân tố khác?`;
  if (processMatch) return `${resolveQuestionSubject(processMatch[1], title)} được tiến hành như thế nào?`;
  if (actionMatch) return `${resolveQuestionSubject(actionMatch[1], title)} được thực hiện như thế nào?`;

  const norm = normalizeTextKey(stripped);
  if (norm.startsWith("la cach thuc")) {
    return `${title} tác động đến quân nhân bằng cách nào?`;
  }
  if (norm.startsWith("la he thong")) {
    return `${title} gồm những cách thức, biện pháp nào?`;
  }
  if (norm.startsWith("la hinh thuc")) {
    return `${title} được hiểu như thế nào?`;
  }
  if (norm.startsWith("la giai doan")) {
    return `${title} giữ vai trò gì trong quá trình giáo dục?`;
  }

  return null;
}

function resolveQuestionSubject(subject: string, title: string): string {
  const normS = normalizeTextKey(subject);
  const normT = normalizeTextKey(title);
  if (normS.length < 3) return title;
  if (/^(đây|đó|ấy|đối tượng này|phương pháp này)/i.test(subject.trim())) {
    return title;
  }
  if (normT.includes(normS)) {
    return title;
  }
  return subject.trim();
}

function buildContextualQuestionFallback(lesson: LessonDocumentModel, anchor: Anchor): EnrichmentPayload {
  const title = cleanAnchorTitle(anchor);
  const contextLines = questionContextLines(lesson, anchor, 8);
  const candidateSentences: string[] = [];

  for (const line of contextLines) {
    const rawSentences = line.split(/(?<=[.!?])\s+/);
    for (const val of rawSentences) {
      const cleaned = val.replace(/^[-;: ]+/, "").trim();
      if (cleaned.length > 5) {
        candidateSentences.push(cleaned);
      }
    }
  }

  let finalQuestion = "";
  for (const sentence of candidateSentences) {
    const q = buildQuestionFromSentence(sentence, title);
    if (q) {
      finalQuestion = q;
      break;
    }
  }

  if (!finalQuestion && contextLines.length > 0) {
    const q = buildQuestionFromSentence(contextLines[0], title);
    if (q) finalQuestion = q;
  }

  if (!finalQuestion) {
    finalQuestion = "Theo đoạn nội dung vừa học, ý chính cần nắm là gì?";
  }

  const answer = contextLines.length > 0 ? contextLines.join(" ") : `${title} có nội dung chính cần tự học.`;

  return {
    recommended_methods: defaultMethodsForAnchor(lesson, anchor),
    questions: [
      {
        question: finalQuestion,
        answer: answer.length > 500 ? answer.slice(0, 500) + "..." : answer,
        difficulty: "basic"
      }
    ],
    source: "fallback"
  };
}

function defaultMethodsForAnchor(lesson: LessonDocumentModel, anchor: Anchor): string[] {
  const outline = findOutlineForAnchor(lesson, anchor);
  const textBlob = outline ? sectionBlocksForOutline(lesson, outline).map((b) => b.text_preview).join(" ") : "";
  const scores: Record<string, number> = {
    "Huong dan nghien cuu": 0,
    "Neu van de": 0,
    "Thao luan nhom": 0,
    "Lop hoc dao nguoc": 0
  };

  const norm = normalizeTextKey(textBlob);
  for (const [method, keywords] of Object.entries(METHOD_POSITIVE_SIGNAL_RULES)) {
    for (const kw of keywords) {
      if (norm.includes(normalizeTextKey(kw))) {
        scores[method] += 2;
      }
    }
  }

  for (const [method, negatives] of Object.entries(METHOD_NEGATIVE_SIGNAL_RULES)) {
    for (const kw of negatives) {
      if (norm.includes(normalizeTextKey(kw))) {
        scores[method] -= 3;
      }
    }
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const best = sorted[0];
  if (best && best[1] > 0) {
    return [best[0]];
  }

  return ["Huong dan nghien cuu"];
}

function stripLeadingLabel(text: string, prefix: string): string {
  const normText = text.trim();
  const normPref = prefix.trim();
  if (normText.toLowerCase().startsWith(normPref.toLowerCase())) {
    return normText.slice(normPref.length).replace(/^[:\s\-]+/, "").trim();
  }
  return normText;
}

function paragraphBlock(anchor: Anchor, referenceBlock: BlockNode | null, orderIndex: number, text: string): BlockNode {
  const style = inheritStyle(referenceBlock);
  return {
    id: `${anchor.id}-${orderIndex}`,
    kind: "inserted_paragraph",
    source: "generated",
    text_preview: text,
    xml: buildInsertedParagraphXml(text, style),
    style_ref: referenceBlock ? referenceBlock.style_ref : null,
    anchor_ref: anchor.id,
    order_index: orderIndex
  };
}

function appendDurationInsertions(
  result: GeneratedInsertion[],
  lesson: LessonDocumentModel,
  anchor: Anchor,
  referenceBlock: BlockNode | null,
  nextIndex: number
): number {
  if (anchor.kind === "content_duration") {
    return nextIndex;
  }

  const text = resolveDurationText(lesson, anchor);
  if (!text) {
    return nextIndex;
  }

  const block = paragraphBlock(anchor, referenceBlock, nextIndex, text);
  result.push({
    id: block.id,
    anchor_id: anchor.id,
    block_id: anchor.block_id,
    label: anchor.label,
    block
  });
  return nextIndex + 1;
}

function appendMethodInsertions(
  result: GeneratedInsertion[],
  anchor: Anchor,
  methods: string[],
  referenceBlock: BlockNode | null,
  nextIndex: number
): number {
  if (methods.length === 0) {
    return nextIndex;
  }

  const displayed = methods.map((m) => METHOD_DISPLAY_LABELS[m] || m);
  const text = `Phương pháp dạy học: ${displayed.join(", ")}.`;
  const block = paragraphBlock(anchor, referenceBlock, nextIndex, text);
  result.push({
    id: block.id,
    anchor_id: anchor.id,
    block_id: anchor.block_id,
    label: anchor.label,
    block
  });
  return nextIndex + 1;
}

function appendQuestionInsertions(
  result: GeneratedInsertion[],
  lesson: LessonDocumentModel,
  anchor: Anchor,
  payload: EnrichmentPayload,
  referenceBlock: BlockNode | null,
  nextIndex: number,
  shouldFallback: boolean
): number {
  let questions = payload.questions;
  if (questions.length === 0 && shouldFallback) {
    questions = buildContextualQuestionFallback(lesson, anchor).questions;
  }
  if (questions.length === 0) {
    return nextIndex;
  }

  const questionLabel = "Câu hỏi:";
  const answerLabel = "Trả lời:";
  const questionSlots = allocateQuestionReferenceBlocks(lesson, anchor, questions.length, referenceBlock);

  let currentIdx = nextIndex;
  for (let i = 0; i < questions.length; i++) {
    const item = questions[i];
    const slotBlock = questionSlots[i];
    const questionText = `${questionLabel} ${stripLeadingLabel(item.question, questionLabel)}`;
    const answerText = `${answerLabel} ${stripLeadingLabel(item.answer, answerLabel)}`;
    const insertionBlockId = slotBlock ? slotBlock.id : anchor.block_id;

    for (const text of [questionText, answerText]) {
      const block = paragraphBlock(anchor, slotBlock || referenceBlock, currentIdx, text);
      result.push({
        id: block.id,
        anchor_id: anchor.id,
        block_id: insertionBlockId,
        label: anchor.label,
        block
      });
      currentIdx++;
    }
  }

  return currentIdx;
}

function defaultQuestionPlan(lesson: LessonDocumentModel, questionAnchors: Anchor[]): { question_plan: any[] } {
  const plan: any[] = [];
  const secContext = buildLessonContext(lesson);
  for (const s of secContext.sections) {
    const matchAnchor = questionAnchors.find((a) => a.outline_id === s.outline_id);
    if (!matchAnchor) continue;
    plan.push({
      outline_id: s.outline_id,
      anchor_block_id: s.body_block_ids[0] || matchAnchor.block_id,
      question_count: s.question_quota_max,
      question_types: ["basic"],
      evidence_block_ids: s.body_block_ids.slice(0, 2)
    });
  }
  return { question_plan: plan };
}

function buildAnchorBlockMap(lesson: LessonDocumentModel, anchors: Anchor[]): Record<string, BlockNode | null> {
  const map: Record<string, BlockNode | null> = {};
  const blockById: Record<string, BlockNode> = {};
  lesson.part_two_blocks.forEach((b) => {
    blockById[b.id] = b;
  });

  for (const anchor of anchors) {
    if (anchor.block_id && blockById[anchor.block_id]) {
      map[anchor.id] = blockById[anchor.block_id];
    } else {
      map[anchor.id] = null;
    }
  }
  return map;
}

function buildOutlinePath(lesson: LessonDocumentModel, outline: OutlineNode | null): string {
  if (!outline) return "";
  const outlines = lesson.gt_chapter.outline;
  const idx = findOutlineIndex(lesson, outline.id);
  if (idx === null) return outline.normalized_title;

  const path: string[] = [];
  let currentLevel = outline.level;
  for (let i = idx; i >= 0; i--) {
    const candidate = outlines[i];
    if (candidate.level <= currentLevel) {
      path.push(candidate.normalized_title);
      currentLevel = candidate.level - 1;
    }
    if (candidate.level === 1) {
      break;
    }
  }
  return path.reverse().join(" > ");
}

interface PlannerPayload {
  question_plan: Array<{
    outline_id: string;
    anchor_block_id: string | null;
    question_count: number;
    question_types: string[];
    evidence_block_ids: string[];
  }>;
}

async function planQuestionAnchors(
  lesson: LessonDocumentModel,
  legacyQuestionAnchors: Anchor[]
): Promise<[Anchor[], string]> {
  const lessonContext = buildLessonContext(lesson);
  if (lessonContext.sections.length === 0) {
    return [legacyQuestionAnchors, "fallback"];
  }

  const promptPackage = buildQuestionPlannerPrompt({
    lesson_context: JSON.stringify(lessonContext, null, 2),
    excluded_ranges: lessonContext.excluded_range_labels
  });

  const res = await callGeminiJson<PlannerPayload>(promptPackage);
  if (res && res.question_plan) {
    const planned: Anchor[] = [];
    let idx = 1;
    for (const item of res.question_plan) {
      const matchedOutline = lesson.gt_chapter.outline.find((o) => o.id === item.outline_id);
      if (!matchedOutline) continue;

      planned.push({
        id: `planned-${item.outline_id}-${idx}`,
        kind: "question_answer",
        label: `Q/A planned cho ${item.outline_id}`,
        block_id: item.anchor_block_id || matchedOutline.block_id,
        outline_id: item.outline_id,
        outline_level: matchedOutline.level,
        question_count: item.question_count,
        evidence_block_ids: item.evidence_block_ids
      });
      idx++;
    }
    if (planned.length > 0) {
      return [planned, "gemini"];
    }
  }

  const fallbackPlan = defaultQuestionPlan(lesson, legacyQuestionAnchors);
  const fallbacks: Anchor[] = [];
  let idx = 1;
  for (const item of fallbackPlan.question_plan) {
    const matchedOutline = lesson.gt_chapter.outline.find((o) => o.id === item.outline_id);
    if (!matchedOutline) continue;

    fallbacks.push({
      id: `fallback-${item.outline_id}-${idx}`,
      kind: "question_answer",
      label: `Q/A fallback cho ${item.outline_id}`,
      block_id: item.anchor_block_id,
      outline_id: item.outline_id,
      outline_level: matchedOutline.level,
      question_count: item.question_count,
      evidence_block_ids: item.evidence_block_ids
    });
    idx++;
  }

  return [fallbacks.length > 0 ? fallbacks : legacyQuestionAnchors, "fallback"];
}

async function generateQuestionPayloads(
  lesson: LessonDocumentModel,
  questionAnchors: Anchor[]
): Promise<[Record<string, EnrichmentPayload>, string, Set<string>]> {
  const aiBacked = new Set<string>();
  const payloadMap: Record<string, EnrichmentPayload> = {};
  if (questionAnchors.length === 0) {
    return [payloadMap, "fallback", aiBacked];
  }

  const promptItems: string[] = [];
  for (const a of questionAnchors) {
    const outline = findOutlineForAnchor(lesson, a);
    const excerpt = questionContextLines(lesson, a, 12).join("\n* ");
    const itemStr =
      `* ID: ${a.id}\n` +
      `* Tieu de: ${a.label}\n` +
      `* Duong dan: ${buildOutlinePath(lesson, outline)}\n` +
      `* So luong yeu cau: ${a.question_count || 1}\n` +
      `* Trich doan hanh trinh: \n* ${excerpt}`;
    promptItems.push(itemStr);
  }

  const promptPackage = buildQuestionGeneratorPrompt({ prompt_items: promptItems });
  const responseObj = await callGeminiJson<{ items: Array<{ anchor_id: string; questions: QuestionPayload[] }> }>(promptPackage);

  if (responseObj && responseObj.items) {
    let source = "gemini";
    const reviewsMap: Record<string, Array<{ question_index: number; verdict: string; reason: string }>> = {};

    // Local Question Review Pass
    const reviewContextLines: string[] = [];
    for (const item of responseObj.items) {
      if (!item.questions || item.questions.length === 0) continue;
      const reviewItemStr =
        `* Anchor_id: ${item.anchor_id}\n` +
        item.questions.map((q, qIndex) => `  * [Cau ${qIndex + 1}]: Q: ${q.question} | A: ${q.answer}`).join("\n");
      reviewContextLines.push(reviewItemStr);
    }

    const reviewPrompt = buildQuestionReviewerPrompt({ generated_questions_context: reviewContextLines.join("\n\n") });
    const reviewRes = await callGeminiJson<{
      reviews: Array<{
        anchor_id: string;
        decisions: Array<{ question_index: number; verdict: string; reason: string }>;
      }>;
    }>(reviewPrompt);

    if (reviewRes && reviewRes.reviews) {
      source = "gemini+review";
      for (const r of reviewRes.reviews) {
        reviewsMap[r.anchor_id] = r.decisions;
      }
    }

    for (const item of responseObj.items) {
      if (!item.questions || item.questions.length === 0) continue;

      const decisions = reviewsMap[item.anchor_id] || [];
      const filteredQuestions = item.questions.filter((q, qIndex) => {
        const decision = decisions.find((d) => d.question_index === qIndex + 1);
        return !decision || decision.verdict !== "reject";
      });

      const finalQuestions = filteredQuestions.length > 0 ? filteredQuestions : item.questions;
      finalQuestions.forEach((q) => {
        q.difficulty = normalizeDifficulty(q.difficulty || "basic");
      });

      payloadMap[item.anchor_id] = {
        recommended_methods: defaultMethodsForAnchor(lesson, questionAnchors.find((a) => a.id === item.anchor_id)!),
        questions: deduplicateQuestions(finalQuestions),
        source
      };
      aiBacked.add(item.anchor_id);
    }

    return [payloadMap, source, aiBacked];
  }

  return [payloadMap, "fallback", aiBacked];
}

export async function enrichLessonDocument(
  lesson: LessonDocumentModel,
  anchorKinds?: Set<string> | null
): Promise<LessonEnrichmentResponse> {
  const anchors = lesson.anchors.filter((a) => !anchorKinds || anchorKinds.has(a.kind));

  const methodAnchors = anchors.filter((a) => a.kind === "method");
  const nonQuestionAnchors = anchors.filter((a) => a.kind !== "question_answer");
  const legacyQuestionAnchors = anchors.filter((a) => a.kind === "question_answer");

  let questionAnchors: Anchor[] = [];
  let questionPlanSource = "fallback";

  if (legacyQuestionAnchors.length > 0) {
    const [planned, qPlanSrc] = await planQuestionAnchors(lesson, legacyQuestionAnchors);
    questionAnchors = planned;
    questionPlanSource = qPlanSrc;
  }

  const activeAnchors = [...nonQuestionAnchors, ...questionAnchors];
  const [questionPayloads, questionSource, aiBackedQuestionAnchorIds] = await generateQuestionPayloads(
    lesson,
    questionAnchors
  );

  const anchorBlockMap = buildAnchorBlockMap(lesson, activeAnchors);
  const insertions: GeneratedInsertion[] = [];
  let nextIndex = lesson.part_one_blocks.length + lesson.part_two_blocks.length;

  for (const anchor of activeAnchors) {
    const referenceBlock = anchorBlockMap[anchor.id] || null;

    if (anchor.kind === "content_duration" || anchor.kind === "section_duration") {
      nextIndex = appendDurationInsertions(insertions, lesson, anchor, referenceBlock, nextIndex);
      continue;
    }

    if (anchor.kind === "method") {
      const methods = defaultMethodsForAnchor(lesson, anchor);
      nextIndex = appendMethodInsertions(insertions, anchor, methods, referenceBlock, nextIndex);
      continue;
    }

    if (anchor.kind === "question_answer") {
      const payload = questionPayloads[anchor.id] || { recommended_methods: [], questions: [] };
      nextIndex = appendQuestionInsertions(
        insertions,
        lesson,
        anchor,
        payload,
        referenceBlock,
        nextIndex,
        !aiBackedQuestionAnchorIds.has(anchor.id)
      );
    }
  }

  const mergedSource = [questionSource, questionPlanSource].filter((s) => s && s !== "fallback").join("+") || "fallback";

  return {
    lesson_id: lesson.lesson_id,
    insertions,
    source: mergedSource
  };
}
