import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import AdmZip from "adm-zip";
import { DOMParser } from "@xmldom/xmldom";
import { exportExamAnswersDocx, ExamAnswerModel, CloDefinition } from "../server/document_pipeline/export_exam_answers_docx";

test("exports exam answers DOCX matching table structure and Times New Roman fonts", () => {
  const sampleAnswer: ExamAnswerModel = {
    questionNumber: 1,
    questionText: "Phân tích các đặc trưng của quá trình sư phạm quân sự. Ý nghĩa vận dụng đối với người cán bộ phân đội để nâng cao hiệu quả quá trình sư phạm ở đơn vị hiện nay.",
    totalScore: "5,0đ",
    introduction: {
      title: "* Đặt vấn đề hợp lý, sát nội dung",
      score: "0,25đ"
    },
    part1: {
      title: "Ý 1: Phân tích đặc trưng của quá trình sư phạm quân sự:",
      score: "2,5đ",
      items: [
        {
          content: "- Nêu, giải thích khái niệm quá trình sư phạm quân sự",
          score: "0,5"
        },
        {
          content: "- Là QT truyền thụ và lĩnh hội những kinh nghiệm XH-LS, KNQS:\n+ Phản ánh MQH bản chất giữa NDG và ĐTGD...",
          score: "0,7"
        },
        {
          content: "- QTSPQS là quá trình chuẩn bị con người cho các lĩnh vực HĐQS...",
          score: "0,7"
        },
        {
          content: "- Là quá trình có tổ chức chặt chẽ, chịu áp lực lớn...",
          score: "0,6"
        }
      ]
    },
    part2: {
      title: "Ý 2: Vận dụng đối với người cán bộ phân đội",
      score: "2,0đ",
      items: [
        {
          content: "- Cần chú trọng bồi dưỡng nâng cao chất lượng của cả hai chủ thể nhà giáo dục và đối tượng giáo dục",
          score: "0,4"
        },
        {
          content: "- Thường xuyên bồi dưỡng phẩm chất, năng lực toàn diện của đội ngũ cán bộ các cấp.",
          score: "0,4"
        },
        {
          content: "- Chú trọng nội dung truyền thụ hệ thống tri thức...",
          score: "0,4"
        },
        {
          content: "- Phải bồi dưỡng động cơ phấn đấu, ý thức trách nhiệm...",
          score: "0,4"
        },
        {
          content: "- Kết hợp giữa huấn luyện với giáo dục hình thành phẩm chất...",
          score: "0,4"
        }
      ]
    },
    conclusion: {
      title: "* Phương pháp trình bày rõ ràng, mạch lạc",
      score: "0,25đ"
    },
    clos: ["1.1", "1.2", "2.2", "3.1", "3.2"],
    levels: {
      easy: "Nêu các đặc trưng của quá trình sư phạm quân sự...",
      medium: "Trình bày các đặc trưng của quá trình sư phạm quân sự...",
      hard: "Phân tích các đặc trưng của quá trình sư phạm quân sự..."
    }
  };

  const clos: CloDefinition[] = [
    { code: "1.1", text: "Phẩm chất chính trị" },
    { code: "1.2", text: "Chấp hành đường lối" },
    { code: "2.1", text: "Giải thích khái niệm" },
    { code: "2.2", text: "Phân tích cấu trúc" },
    { code: "3.1", text: "Thực hiện yêu cầu" },
    { code: "3.2", text: "Vận dụng quy luật" }
  ];

  const outputPath = path.join(os.tmpdir(), `k5-test-exam-answers-${Date.now()}.docx`);
  try {
    exportExamAnswersDocx([sampleAnswer], clos, outputPath, "File demo Bien soan CH,DA.docx");
    assert.ok(fs.existsSync(outputPath));

    const zip = new AdmZip(outputPath);
    const docXml = zip.readAsText("word/document.xml");
    assert.ok(docXml.includes("NGÂN HÀNG CÂU HỎI VÀ ĐÁP ÁN MÔN HỌC"));
    assert.ok(docXml.includes("Đặt vấn đề hợp lý, sát nội dung"));
    assert.ok(docXml.includes("Ý 1: Phân tích đặc trưng của quá trình sư phạm quân sự:"));
    assert.ok(docXml.includes("Ý 2: Vận dụng đối với người cán bộ phân đội"));
    assert.ok(docXml.includes("Phương pháp trình bày rõ ràng, mạch lạc"));
    assert.ok(docXml.includes("Ma trận biểu thị sự phù hợp"));
    assert.ok(docXml.includes("1. Dễ:"));

    // Check fonts
    const doc = new DOMParser().parseFromString(docXml, "text/xml");
    for (const rFonts of Array.from(doc.getElementsByTagName("w:rFonts")) as any[]) {
      for (const attr of ["ascii", "hAnsi", "cs", "eastAsia"]) {
        assert.equal(rFonts.getAttribute(`w:${attr}`), "Times New Roman");
      }
    }
  } finally {
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
  }
});

test("exports questions-only DOCX containing only Level 3 questions and not answers or CLO matrix", () => {
  const sampleAnswer: ExamAnswerModel = {
    questionNumber: 1,
    questionText: "Khái niệm quá trình huấn luyện quân nhân",
    totalScore: "5,0đ",
    introduction: { title: "* Đặt vấn đề", score: "0,25đ" },
    part1: { title: "Ý 1: Lý luận", score: "2,5đ", items: [{ content: "Nội dung ý 1", score: "2,5" }] },
    part2: { title: "Ý 2: Vận dụng", score: "2,0đ", items: [{ content: "Nội dung ý 2", score: "2,0" }] },
    conclusion: { title: "* Kết luận", score: "0,25đ" },
    clos: ["1.1", "2.2"],
    levels: {
      easy: "Nêu khái niệm quá trình huấn luyện quân nhân.",
      medium: "Trình bày khái niệm quá trình huấn luyện quân nhân. Rút ra ý nghĩa đối với bản thân.",
      hard: "Phân tích khái niệm quá trình huấn luyện quân nhân. Ý nghĩa vận dụng đối với người cán bộ phân đội."
    }
  };

  const clos: CloDefinition[] = [{ code: "1.1", text: "Phẩm chất chính trị" }];
  const outputPath = path.join(os.tmpdir(), `k5-test-questions-only-${Date.now()}.docx`);

  try {
    exportExamAnswersDocx([sampleAnswer], clos, outputPath, "File demo Bien soan CH,DA.docx", { mode: "questions" });
    assert.ok(fs.existsSync(outputPath));

    const zip = new AdmZip(outputPath);
    const docXml = zip.readAsText("word/document.xml");
    assert.ok(docXml.includes("NGÂN HÀNG CÂU HỎI MÔN HỌC"));
    assert.ok(docXml.includes("1. Dễ: Nêu khái niệm"));
    assert.ok(docXml.includes("2. Trung bình: Trình bày"));
    assert.ok(docXml.includes("3. Khó: Phân tích"));
    // Must NOT contain answers table or CLO matrix
    assert.equal(docXml.includes("Đặt vấn đề"), false);
    assert.equal(docXml.includes("Ý 1: Lý luận"), false);
    assert.equal(docXml.includes("Ma trận biểu thị sự phù hợp"), false);
  } finally {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
});

test("exports answers-only DOCX containing Phần I and Phần II and not Level 3 questions", () => {
  const sampleAnswer: ExamAnswerModel = {
    questionNumber: 1,
    questionText: "Khái niệm quá trình huấn luyện quân nhân",
    totalScore: "5,0đ",
    introduction: { title: "* Đặt vấn đề hợp lý", score: "0,25đ" },
    part1: { title: "Ý 1: Lý luận cơ bản", score: "2,5đ", items: [{ content: "Nội dung ý 1", score: "2,5" }] },
    part2: { title: "Ý 2: Ý nghĩa vận dụng", score: "2,0đ", items: [{ content: "Nội dung ý 2", score: "2,0" }] },
    conclusion: { title: "* Phương pháp trình bày", score: "0,25đ" },
    clos: ["1.1", "2.2"],
    levels: {
      easy: "Nêu khái niệm.",
      medium: "Trình bày khái niệm.",
      hard: "Phân tích khái niệm."
    }
  };

  const clos: CloDefinition[] = [{ code: "1.1", text: "Phẩm chất chính trị" }];
  const outputPath = path.join(os.tmpdir(), `k5-test-answers-only-${Date.now()}.docx`);

  try {
    exportExamAnswersDocx([sampleAnswer], clos, outputPath, "File demo Bien soan CH,DA.docx", { mode: "answers" });
    assert.ok(fs.existsSync(outputPath));

    const zip = new AdmZip(outputPath);
    const docXml = zip.readAsText("word/document.xml");
    assert.ok(docXml.includes("NGÂN HÀNG ĐÁP ÁN VÀ MA TRẬN MÔN HỌC"));
    assert.ok(docXml.includes("Đặt vấn đề hợp lý"));
    assert.ok(docXml.includes("Ý 1: Lý luận cơ bản"));
    assert.ok(docXml.includes("Ý 2: Ý nghĩa vận dụng"));
    assert.ok(docXml.includes("Ma trận biểu thị sự phù hợp"));
    // Must NOT contain 3 levels questions
    assert.equal(docXml.includes("1. Dễ:"), false);
    assert.equal(docXml.includes("2. Trung bình:"), false);
    assert.equal(docXml.includes("3. Khó:"), false);
  } finally {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
});
