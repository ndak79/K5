import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit3,
  FileDown,
  FileText,
  HelpCircle,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  UploadCloud,
  X
} from "lucide-react";
import { Layout } from "../components/layout";
import {
  ExamAnswerModel,
  ExamAnswerSessionSummary,
  exportExamAnswersDocxBlob,
  fetchExamAnswersSession,
  generateBulkExamAnswers,
  generateExamAnswer,
  resetExamAnswersSession,
  updateExamAnswer,
  uploadExamAnswersCdr,
  uploadExamAnswersGt,
  uploadExamAnswersQuestions
} from "../lib/api/client";

const EMPTY_SESSION: ExamAnswerSessionSummary = {
  session_id: "empty",
  cdr_file_name: null,
  gt_file_name: null,
  questions_file_name: null,
  cdr_status: "missing",
  gt_status: "missing",
  questions_status: "missing",
  cdr_error: null,
  gt_error: null,
  questions_error: null,
  total_questions: 0,
  completed_questions: 0,
  clos: [],
  questions: []
};

export function ExamAnswersPage() {
  const [session, setSession] = useState<ExamAnswerSessionSummary>(EMPTY_SESSION);
  const [uploadingCdr, setUploadingCdr] = useState(false);
  const [uploadingGt, setUploadingGt] = useState(false);
  const [uploadingQuestions, setUploadingQuestions] = useState(false);
  const [generatingNum, setGeneratingNum] = useState<number | null>(null);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "idle">("all");
  const [expandedQuestions, setExpandedQuestions] = useState<Record<number, boolean>>({});
  const [editingAnswer, setEditingAnswer] = useState<ExamAnswerModel | null>(null);

  function refreshSession() {
    fetchExamAnswersSession()
      .then((s) => setSession(s))
      .catch(() => setSession(EMPTY_SESSION));
  }

  useEffect(() => {
    refreshSession();
  }, []);

  function handleUploadCdr(file: File) {
    setUploadingCdr(true);
    setFeedback(null);
    uploadExamAnswersCdr(file)
      .then((sess) => {
        setSession(sess);
        setFeedback({ message: "Đã tải lên & bóc tách Chuẩn đầu ra (CLO) thành công!", type: "success" });
      })
      .catch((err) => {
        setFeedback({ message: err.message || "Tải file CDR thất bại", type: "error" });
      })
      .finally(() => setUploadingCdr(false));
  }

  function handleUploadGt(file: File) {
    setUploadingGt(true);
    setFeedback(null);
    uploadExamAnswersGt(file)
      .then((sess) => {
        setSession(sess);
        setFeedback({ message: "Đã tải lên & xử lý cấu trúc Giáo trình thành công!", type: "success" });
      })
      .catch((err) => {
        setFeedback({ message: err.message || "Tải file Giáo trình thất bại", type: "error" });
      })
      .finally(() => setUploadingGt(false));
  }

  function handleUploadQuestions(file: File) {
    setUploadingQuestions(true);
    setFeedback(null);
    uploadExamAnswersQuestions(file)
      .then((sess) => {
        setSession(sess);
        setFeedback({
          message: "Đã trích xuất thành công " + sess.questions.length + " câu hỏi từ ngân hàng!",
          type: "success"
        });
      })
      .catch((err) => {
        setFeedback({ message: err.message || "Tải file câu hỏi thất bại", type: "error" });
      })
      .finally(() => setUploadingQuestions(false));
  }

  function handleGenerateSingle(qNum: number) {
    setGeneratingNum(qNum);
    setFeedback(null);
    generateExamAnswer(qNum)
      .then((res) => {
        setSession(res.session);
        setExpandedQuestions((prev) => ({ ...prev, [qNum]: true }));
        setFeedback({ message: "Đã hoàn thành sinh đáp án cho Câu hỏi " + qNum + "!", type: "success" });
      })
      .catch((err) => {
        setFeedback({ message: err.message || "Lỗi sinh đáp án cho Câu hỏi " + qNum, type: "error" });
      })
      .finally(() => setGeneratingNum(null));
  }

  function handleGenerateBulk() {
    const pendingNums = session.questions
      .filter((q) => q.status !== "completed")
      .map((q) => q.number);

    if (pendingNums.length === 0) {
      setFeedback({ message: "Tất cả câu hỏi đều đã có đáp án!", type: "info" });
      return;
    }

    setBulkGenerating(true);
    setFeedback({
      message: "Đang xử lý sinh đáp án tự động cho " + pendingNums.length + " câu hỏi, vui lòng chờ...",
      type: "info"
    });

    generateBulkExamAnswers(pendingNums)
      .then((sess) => {
        setSession(sess);
        setFeedback({ message: "Đã hoàn thành sinh đáp án hàng loạt!", type: "success" });
      })
      .catch((err) => {
        setFeedback({ message: err.message || "Lỗi trong quá trình sinh đáp án hàng loạt", type: "error" });
      })
      .finally(() => setBulkGenerating(false));
  }

  function handleReset() {
    if (!window.confirm("Bạn có chắc chắn muốn làm mới toàn bộ phiên làm việc tạo đáp án không?")) {
      return;
    }
    resetExamAnswersSession()
      .then((sess) => {
        setSession(sess);
        setExpandedQuestions({});
        setEditingAnswer(null);
        setFeedback({ message: "Đã đặt lại phiên làm việc thành công.", type: "info" });
      })
      .catch((err) => {
        setFeedback({ message: err.message || "Lỗi đặt lại phiên làm việc", type: "error" });
      });
  }

  function handleExport() {
    if (session.completed_questions === 0) {
      setFeedback({ message: "Chưa có đáp án nào được sinh để tải xuống!", type: "error" });
      return;
    }
    setIsExporting(true);
    exportExamAnswersDocxBlob()
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "Dap_An_Va_Thang_Diem_Cau_Hoi.docx";
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setFeedback({ message: "Tải file DOCX đáp án thành công!", type: "success" });
      })
      .catch((err) => {
        setFeedback({ message: err.message || "Tải file thất bại", type: "error" });
      })
      .finally(() => setIsExporting(false));
  }

  function handleSaveEdit() {
    if (!editingAnswer) return;
    updateExamAnswer(editingAnswer.questionNumber, editingAnswer)
      .then((sess) => {
        setSession(sess);
        setEditingAnswer(null);
        setFeedback({ message: "Đã lưu thay đổi cho Câu hỏi " + editingAnswer.questionNumber + "!", type: "success" });
      })
      .catch((err) => {
        setFeedback({ message: err.message || "Lỗi lưu chỉnh sửa", type: "error" });
      });
  }

  const toggleExpand = (num: number) => {
    setExpandedQuestions((prev) => ({ ...prev, [num]: !prev[num] }));
  };

  const isReady =
    session.questions_status === "ready" && session.gt_status === "ready";

  const filteredQuestions = session.questions.filter((q) => {
    const matchesSearch =
      !searchQuery ||
      q.number.toString().includes(searchQuery) ||
      q.question.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter === "completed") return q.status === "completed";
    if (statusFilter === "idle") return q.status !== "completed";
    return true;
  });

  return (
    <Layout>
      <div className="space-y-8 pb-16">
        <div className="relative overflow-hidden bg-gradient-to-r from-sage-light via-paper to-sage-hover/40 border border-sage-border rounded-[28px] p-6 md:p-8 shadow-sm">
          <div className="relative z-10 max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent font-mono text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI EXAM ANSWER GENERATOR STUDIO</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black font-serif text-accent tracking-tight">
              Xưởng Biên Soạn Câu Hỏi &amp; Đáp Án
            </h2>
            <p className="text-xs md:text-sm text-ink/70 leading-relaxed">
              Tự động gợi ý đáp án chi tiết bám sát giáo trình học phần, phân chia ý rõ ràng theo thang điểm chuẩn 5,0đ
              (Đặt vấn đề 0,25đ; Ý 1 lý luận 2,5đ; Ý 2 vận dụng thực tiễn 2,0đ; Trình bày 0,25đ), kèm ma trận chuẩn đầu ra CLO
              và 3 mức độ câu hỏi.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-white rounded-[24px] border border-sage-border p-5 space-y-4 shadow-xs hover:border-accent/40 transition-all flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold text-accent bg-accent/10 px-2.5 py-0.5 rounded-full uppercase">
                  1. CHUẨN ĐẦU RA (CDR)
                </span>
                {session.cdr_status === "ready" && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Đã nạp
                  </span>
                )}
              </div>
              <h4 className="font-serif font-bold text-sm text-accent">File Chuẩn đầu ra (.docx)</h4>
              <p className="text-xs text-ink/60 line-clamp-2">
                Bóc tách các mã CLO (1.1, 1.2, 2.1, 2.2, 3.1, 3.2...) để xây dựng ma trận đáp ứng.
              </p>
            </div>

            <div>
              <input
                type="file"
                accept=".docx"
                id="cdr-file-input"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadCdr(f);
                }}
              />
              <button
                onClick={() => document.getElementById("cdr-file-input")?.click()}
                disabled={uploadingCdr}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-dashed border-sage-border hover:border-accent bg-sage-light/40 hover:bg-sage-light text-xs font-semibold text-accent transition-all cursor-pointer disabled:opacity-50"
              >
                {uploadingCdr ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                <span className="truncate">{session.cdr_file_name || "Tải lên file CDR (.docx)"}</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-[24px] border border-sage-border p-5 space-y-4 shadow-xs hover:border-accent/40 transition-all flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold text-accent bg-accent/10 px-2.5 py-0.5 rounded-full uppercase">
                  2. GIÁO TRÌNH (GT)
                </span>
                {session.gt_status === "ready" && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Đã nạp
                  </span>
                )}
              </div>
              <h4 className="font-serif font-bold text-sm text-accent">File Giáo trình chi tiết (.docx)</h4>
              <p className="text-xs text-ink/60 line-clamp-2">
                Làm cơ sở học thuật sâu sắc để AI trích xuất nội dung giải thích và phân tích.
              </p>
            </div>

            <div>
              <input
                type="file"
                accept=".docx"
                id="gt-file-input"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadGt(f);
                }}
              />
              <button
                onClick={() => document.getElementById("gt-file-input")?.click()}
                disabled={uploadingGt}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-dashed border-sage-border hover:border-accent bg-sage-light/40 hover:bg-sage-light text-xs font-semibold text-accent transition-all cursor-pointer disabled:opacity-50"
              >
                {uploadingGt ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                <span className="truncate">{session.gt_file_name || "Tải lên file Giáo trình (.docx)"}</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-[24px] border border-sage-border p-5 space-y-4 shadow-xs hover:border-accent/40 transition-all flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold text-accent bg-accent/10 px-2.5 py-0.5 rounded-full uppercase">
                  3. CÂU HỎI ÔN TẬP
                </span>
                {session.questions_status === "ready" && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {session.questions.length} câu hỏi
                  </span>
                )}
              </div>
              <h4 className="font-serif font-bold text-sm text-accent">File Ngân hàng câu hỏi (.docx)</h4>
              <p className="text-xs text-ink/60 line-clamp-2">
                Tự động bóc tách danh mục các câu hỏi cần lập đáp án và thang điểm chi tiết.
              </p>
            </div>

            <div>
              <input
                type="file"
                accept=".docx"
                id="questions-file-input"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadQuestions(f);
                }}
              />
              <button
                onClick={() => document.getElementById("questions-file-input")?.click()}
                disabled={uploadingQuestions}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-dashed border-sage-border hover:border-accent bg-sage-light/40 hover:bg-sage-light text-xs font-semibold text-accent transition-all cursor-pointer disabled:opacity-50"
              >
                {uploadingQuestions ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                <span className="truncate">{session.questions_file_name || "Tải file Câu hỏi ôn tập (.docx)"}</span>
              </button>
            </div>
          </div>
        </div>

        {feedback && (
          <div
            className={"p-4 rounded-2xl border text-xs flex items-center justify-between gap-3 shadow-xs " + (
              feedback.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : feedback.type === "error"
                  ? "bg-red-50 border-red-200 text-red-800"
                  : "bg-blue-50 border-blue-200 text-blue-800"
            )}
          >
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 flex-shrink-0 text-accent" />
              <span>{feedback.message}</span>
            </div>
            <button onClick={() => setFeedback(null)} className="text-ink/40 hover:text-ink">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {!isReady ? (
          <div className="bg-[#FAF8F5] rounded-[24px] border border-sage-border p-10 text-center space-y-3">
            <HelpCircle className="w-12 h-12 text-[#7A3E2A] mx-auto opacity-70" />
            <h3 className="text-base md:text-lg font-serif font-bold text-[#5C2B1B]">
              Vui lòng tải lên tài liệu để khởi động xưởng tạo đáp án
            </h3>
            <p className="text-xs text-[#7D5A4F] max-w-xl mx-auto leading-relaxed">
              Cần nạp tối thiểu <b>File Giáo trình (.docx)</b> và <b>File Câu hỏi ôn tập (.docx)</b> (kèm <b>File CDR</b> để có ma trận chuẩn CLO).
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-[24px] border border-sage-border p-5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xs">
              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="p-3 bg-accent/10 rounded-2xl border border-accent/20">
                  <FileText className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h4 className="font-serif font-bold text-accent text-sm md:text-base">
                    Ngân hàng câu hỏi ({session.questions.length} câu)
                  </h4>
                  <p className="text-xs text-ink/65">
                    Đã hoàn thành: <strong className="text-emerald-600">{session.completed_questions}</strong> / {session.questions.length} câu
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap w-full md:w-auto justify-end">
                <button
                  onClick={handleGenerateBulk}
                  disabled={bulkGenerating || generatingNum !== null || session.completed_questions === session.questions.length}
                  className="flex items-center gap-1.5 bg-accent hover:bg-sage-dark text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {bulkGenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  <span>Sinh đáp án tất cả</span>
                </button>

                <button
                  onClick={handleExport}
                  disabled={isExporting || session.completed_questions === 0}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isExporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                  <span>Tải file Đáp án (.docx)</span>
                </button>

                <button
                  onClick={handleReset}
                  className="flex items-center gap-1 py-2.5 px-3 rounded-xl border border-sage-border hover:bg-sage-light text-xs text-ink/60 hover:text-accent transition-all cursor-pointer"
                  title="Đặt lại phiên"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-ink/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm kiếm nội dung câu hỏi..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white border border-sage-border rounded-xl text-xs focus:outline-none focus:border-accent text-ink"
                />
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  onClick={() => setStatusFilter("all")}
                  className={"px-3 py-1.5 rounded-lg text-xs font-semibold transition-all " + (
                    statusFilter === "all"
                      ? "bg-accent text-white"
                      : "bg-white border border-sage-border text-ink/60 hover:text-accent"
                  )}
                >
                  Tất cả ({session.questions.length})
                </button>
                <button
                  onClick={() => setStatusFilter("completed")}
                  className={"px-3 py-1.5 rounded-lg text-xs font-semibold transition-all " + (
                    statusFilter === "completed"
                      ? "bg-emerald-600 text-white"
                      : "bg-white border border-sage-border text-ink/60 hover:text-emerald-700"
                  )}
                >
                  Đã có đáp án ({session.completed_questions})
                </button>
                <button
                  onClick={() => setStatusFilter("idle")}
                  className={"px-3 py-1.5 rounded-lg text-xs font-semibold transition-all " + (
                    statusFilter === "idle"
                      ? "bg-amber-600 text-white"
                      : "bg-white border border-sage-border text-ink/60 hover:text-amber-700"
                  )}
                >
                  Chưa sinh ({session.questions.length - session.completed_questions})
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {filteredQuestions.map((q) => {
                const isExpanded = !!expandedQuestions[q.number];
                const isGenerating = generatingNum === q.number;
                const hasAnswer = q.status === "completed" && q.answer;

                return (
                  <div
                    key={q.number}
                    className="bg-white rounded-[20px] border border-sage-border shadow-xs overflow-hidden transition-all hover:border-accent/40"
                  >
                    <div className="p-4 md:p-5 flex items-start justify-between gap-4">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-black px-2 py-0.5 rounded-md bg-accent/10 text-accent">
                            CÂU {q.number}
                          </span>
                          {hasAnswer ? (
                            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                              Đã hoàn thành (5,0đ)
                            </span>
                          ) : (
                            <span className="text-[11px] font-semibold text-ink/50 bg-paper border border-sage-border px-2 py-0.5 rounded-md">
                              Chưa có đáp án
                            </span>
                          )}
                        </div>
                        <h4 className="font-serif font-bold text-sm md:text-base text-ink leading-snug pt-1">
                          {q.question}
                        </h4>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleGenerateSingle(q.number)}
                          disabled={isGenerating || bulkGenerating}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent hover:bg-sage-dark text-white text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer shadow-xs"
                        >
                          {isGenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          <span>{hasAnswer ? "Sinh lại" : "Gợi ý đáp án"}</span>
                        </button>

                        {hasAnswer && (
                          <>
                            <button
                              onClick={() => setEditingAnswer(JSON.parse(JSON.stringify(q.answer)))}
                              className="p-1.5 rounded-xl border border-sage-border hover:bg-sage-light text-ink/60 hover:text-accent transition-all cursor-pointer"
                              title="Chỉnh sửa đáp án"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>

                            <button
                              onClick={() => toggleExpand(q.number)}
                              className="p-1.5 rounded-xl border border-sage-border hover:bg-sage-light text-ink/60 hover:text-accent transition-all cursor-pointer"
                              title={isExpanded ? "Thu gọn" : "Xem chi tiết"}
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {hasAnswer && isExpanded && q.answer && (
                      <div className="border-t border-sage-border bg-[#FDFBF7] p-5 space-y-6">
                        <div className="overflow-x-auto rounded-xl border border-sage-border bg-white shadow-xs">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="bg-sage-light/60 border-b border-sage-border text-accent font-serif font-bold">
                                <th className="p-3 text-left">Nội dung đáp án chuẩn hóa</th>
                                <th className="p-3 text-center w-24">Thang điểm</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-sage-border/60">
                              <tr className="bg-[#FAF8F5] font-serif font-bold">
                                <td className="p-3 text-ink">
                                  Câu hỏi {q.number}: {q.question}
                                </td>
                                <td className="p-3 text-center text-accent font-mono font-bold">
                                  {q.answer.totalScore || "5,0đ"}
                                </td>
                              </tr>

                              <tr className="font-bold text-accent">
                                <td className="p-3">{q.answer.introduction?.title || "* Đặt vấn đề hợp lý, sát nội dung"}</td>
                                <td className="p-3 text-center font-mono">{q.answer.introduction?.score || "0,25đ"}</td>
                              </tr>

                              <tr className="font-bold text-accent bg-sage-light/30">
                                <td className="p-3">{q.answer.part1?.title || "Ý 1: Phân tích nội dung lý luận"}</td>
                                <td className="p-3 text-center font-mono">{q.answer.part1?.score || "2,5đ"}</td>
                              </tr>
                              {q.answer.part1?.items?.map((item, idx) => (
                                <tr key={idx} className="hover:bg-sage-light/10">
                                  <td className="p-3 pl-6 text-ink/85 whitespace-pre-line leading-relaxed">
                                    {item.content}
                                  </td>
                                  <td className="p-3 text-center font-mono text-ink/70">{item.score}</td>
                                </tr>
                              ))}

                              <tr className="font-bold text-accent bg-sage-light/30">
                                <td className="p-3">{q.answer.part2?.title || "Ý 2: Vận dụng đối với người cán bộ phân đội"}</td>
                                <td className="p-3 text-center font-mono">{q.answer.part2?.score || "2,0đ"}</td>
                              </tr>
                              {q.answer.part2?.items?.map((item, idx) => (
                                <tr key={idx} className="hover:bg-sage-light/10">
                                  <td className="p-3 pl-6 text-ink/85 whitespace-pre-line leading-relaxed">
                                    {item.content}
                                  </td>
                                  <td className="p-3 text-center font-mono text-ink/70">{item.score}</td>
                                </tr>
                              ))}

                              <tr className="font-bold text-accent">
                                <td className="p-3">{q.answer.conclusion?.title || "* Phương pháp trình bày rõ ràng, mạch lạc"}</td>
                                <td className="p-3 text-center font-mono">{q.answer.conclusion?.score || "0,25đ"}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                          <div className="bg-white p-4 rounded-xl border border-sage-border space-y-2">
                            <span className="font-bold text-accent font-serif uppercase tracking-wider block">
                              Chuẩn đầu ra đáp ứng (CLO):
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {q.answer.clos && q.answer.clos.length > 0 ? (
                                q.answer.clos.map((code) => (
                                  <span
                                    key={code}
                                    className="px-2 py-0.5 bg-accent/10 text-accent font-mono font-bold rounded-md"
                                  >
                                    CLO {code}
                                  </span>
                                ))
                              ) : (
                                <span className="text-ink/40 italic">Chưa xác định</span>
                              )}
                            </div>
                          </div>

                          <div className="bg-white p-4 rounded-xl border border-sage-border space-y-2">
                            <span className="font-bold text-accent font-serif uppercase tracking-wider block">
                              Đề xuất 3 mức độ câu hỏi:
                            </span>
                            <div className="space-y-1 text-ink/80 leading-relaxed">
                              <div>
                                <strong className="text-accent">1. Dễ:</strong> {q.answer.levels?.easy || "..."}
                              </div>
                              <div>
                                <strong className="text-accent">2. Trung bình:</strong> {q.answer.levels?.medium || "..."}
                              </div>
                              <div>
                                <strong className="text-accent">3. Khó:</strong> {q.answer.levels?.hard || "..."}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {editingAnswer && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-[24px] border border-sage-border shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-fade-in">
              <div className="p-5 border-b border-sage-border flex items-center justify-between bg-sage-light/40">
                <div className="flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-accent" />
                  <h4 className="font-serif font-bold text-base text-accent">
                    Chỉnh sửa đáp án - Câu hỏi {editingAnswer.questionNumber}
                  </h4>
                </div>
                <button onClick={() => setEditingAnswer(null)} className="text-ink/40 hover:text-ink">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
                <div className="space-y-1">
                  <label className="font-bold text-ink/70">Nội dung câu hỏi:</label>
                  <p className="p-3 bg-[#FAF8F5] rounded-xl border border-sage-border text-ink font-serif font-semibold">
                    {editingAnswer.questionText}
                  </p>
                </div>

                <div className="space-y-3 p-4 bg-sage-light/20 rounded-xl border border-sage-border">
                  <div className="flex items-center justify-between">
                    <input
                      type="text"
                      value={editingAnswer.part1.title}
                      onChange={(e) =>
                        setEditingAnswer({
                          ...editingAnswer,
                          part1: { ...editingAnswer.part1, title: e.target.value }
                        })
                      }
                      className="font-bold text-accent font-serif bg-white border border-sage-border px-2 py-1 rounded-lg w-2/3"
                    />
                    <span className="font-mono font-bold text-accent">{editingAnswer.part1.score}</span>
                  </div>
                  {editingAnswer.part1.items.map((item, idx) => (
                    <div key={idx} className="flex gap-2">
                      <textarea
                        rows={2}
                        value={item.content}
                        onChange={(e) => {
                          const items = [...editingAnswer.part1.items];
                          items[idx].content = e.target.value;
                          setEditingAnswer({ ...editingAnswer, part1: { ...editingAnswer.part1, items } });
                        }}
                        className="flex-1 p-2 bg-white border border-sage-border rounded-lg text-ink"
                      />
                      <input
                        type="text"
                        value={item.score}
                        onChange={(e) => {
                          const items = [...editingAnswer.part1.items];
                          items[idx].score = e.target.value;
                          setEditingAnswer({ ...editingAnswer, part1: { ...editingAnswer.part1, items } });
                        }}
                        className="w-16 p-2 bg-white border border-sage-border rounded-lg text-center font-mono"
                        placeholder="Điểm"
                      />
                    </div>
                  ))}
                </div>

                <div className="space-y-3 p-4 bg-sage-light/20 rounded-xl border border-sage-border">
                  <div className="flex items-center justify-between">
                    <input
                      type="text"
                      value={editingAnswer.part2.title}
                      onChange={(e) =>
                        setEditingAnswer({
                          ...editingAnswer,
                          part2: { ...editingAnswer.part2, title: e.target.value }
                        })
                      }
                      className="font-bold text-accent font-serif bg-white border border-sage-border px-2 py-1 rounded-lg w-2/3"
                    />
                    <span className="font-mono font-bold text-accent">{editingAnswer.part2.score}</span>
                  </div>
                  {editingAnswer.part2.items.map((item, idx) => (
                    <div key={idx} className="flex gap-2">
                      <textarea
                        rows={2}
                        value={item.content}
                        onChange={(e) => {
                          const items = [...editingAnswer.part2.items];
                          items[idx].content = e.target.value;
                          setEditingAnswer({ ...editingAnswer, part2: { ...editingAnswer.part2, items } });
                        }}
                        className="flex-1 p-2 bg-white border border-sage-border rounded-lg text-ink"
                      />
                      <input
                        type="text"
                        value={item.score}
                        onChange={(e) => {
                          const items = [...editingAnswer.part2.items];
                          items[idx].score = e.target.value;
                          setEditingAnswer({ ...editingAnswer, part2: { ...editingAnswer.part2, items } });
                        }}
                        className="w-16 p-2 bg-white border border-sage-border rounded-lg text-center font-mono"
                        placeholder="Điểm"
                      />
                    </div>
                  ))}
                </div>

                {/* 3 Levels */}
                <div className="space-y-3 p-4 bg-sage-light/20 rounded-xl border border-sage-border">
                  <h5 className="font-bold text-accent font-serif">Đề xuất 3 mức độ câu hỏi (Dễ, Trung bình, Khó):</h5>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-[11px] font-bold text-ink/70 mb-1">1. Mức Dễ (Nhận biết - Tái hiện):</label>
                      <textarea
                        rows={2}
                        value={editingAnswer.levels?.easy || ""}
                        onChange={(e) =>
                          setEditingAnswer({
                            ...editingAnswer,
                            levels: {
                              easy: e.target.value,
                              medium: editingAnswer.levels?.medium || "",
                              hard: editingAnswer.levels?.hard || ""
                            }
                          })
                        }
                        className="w-full p-2 bg-white border border-sage-border rounded-lg text-ink"
                        placeholder="Nêu... và làm rõ khái niệm..."
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-ink/70 mb-1">2. Mức Trung bình (Thông hiểu & Vận dụng cơ bản):</label>
                      <textarea
                        rows={2}
                        value={editingAnswer.levels?.medium || ""}
                        onChange={(e) =>
                          setEditingAnswer({
                            ...editingAnswer,
                            levels: {
                              easy: editingAnswer.levels?.easy || "",
                              medium: e.target.value,
                              hard: editingAnswer.levels?.hard || ""
                            }
                          })
                        }
                        className="w-full p-2 bg-white border border-sage-border rounded-lg text-ink"
                        placeholder="Trình bày nội dung... Rút ra các yêu cầu vận dụng..."
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-ink/70 mb-1">3. Mức Khó (Phân tích sâu & Vận dụng sáng tạo):</label>
                      <textarea
                        rows={2}
                        value={editingAnswer.levels?.hard || ""}
                        onChange={(e) =>
                          setEditingAnswer({
                            ...editingAnswer,
                            levels: {
                              easy: editingAnswer.levels?.easy || "",
                              medium: editingAnswer.levels?.medium || "",
                              hard: e.target.value
                            }
                          })
                        }
                        className="w-full p-2 bg-white border border-sage-border rounded-lg text-ink"
                        placeholder="Phân tích toàn diện/tính biện chứng... Từ đó luận giải các biện pháp..."
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-sage-border bg-sage-light/30 flex items-center justify-end gap-3">
                <button
                  onClick={() => setEditingAnswer(null)}
                  className="px-4 py-2 rounded-xl border border-sage-border bg-white text-xs font-semibold text-ink/70 hover:bg-sage-light"
                >
                  Hủy bỏ
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white text-xs font-bold hover:bg-sage-dark shadow-xs cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Lưu thay đổi</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
