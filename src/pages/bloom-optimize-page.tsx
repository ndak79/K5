import React, { useEffect, useState, useTransition } from "react";
import { Layout } from "../components/layout";
import {
  fetchBloomSession,
  uploadBloomCdr,
  uploadBloomGt,
  fetchBloomState,
  updateBloomVerbs,
  generateLessonSuggestions,
  generateBulkLessonsSuggestions,
  selectLessonOutcomes,
  selectBloomSubitem,
  generateCourseSuggestions,
  selectCourseOutcomes,
  selectBloomCourseSubitem,
  resetBloomState,
  exportBloomCdrBlob,
  type BloomState,
  type BloomSuggestionItem
} from "../lib/api/client";
import type { UploadSessionSummary } from "../lib/schemas/lesson";
import {
  Sparkles,
  BookOpen,
  FileDown,
  RefreshCw,
  Edit2,
  Check,
  Plus,
  Trash2,
  HelpCircle,
  ChevronRight,
  Settings,
  AlertCircle
} from "lucide-react";

const EMPTY_SESSION: UploadSessionSummary = {
  session_id: "empty",
  cdr_file_name: null,
  gt_file_name: null,
  cdr_status: "missing",
  gt_status: "missing",
  cdr_error: null,
  gt_error: null,
  processing: false,
  can_extract: false,
  lessons: []
};

export function BloomOptimizePage() {
  const [session, setSession] = useState<UploadSessionSummary>(EMPTY_SESSION);
  const [state, setState] = useState<BloomState | null>(null);
  
  const cleanLessonTitle = (title: string, num: number) => {
    if (!title) return "";
    let cleaned = title.normalize("NFC").trim();
    // Ultra-robust recursive stripping of "Bài X:", "bài x.", "Bài  0x - " etc.
    // Handles Vietnamese accents, variations, and potential garbled text like "BÃ i"
    const prefixRegexes = [
      /^\s*(b\u00e0i|b\u00e3\s*i|bai)\s*\d+[\s:.-]*/i,
      /^\s*ch\u01b0\u01a1ng\s*\d+[\s:.-]*/i
    ];
    let prev;
    do {
      prev = cleaned;
      for (const regex of prefixRegexes) {
        cleaned = cleaned.replace(regex, "");
      }
      cleaned = cleaned.trim();
    } while (cleaned !== prev);
    
    return cleaned;
  };
  
  // Independent uploading states
  const [uploadingCdr, setUploadingCdr] = useState(false);
  const [uploadingGt, setUploadingGt] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Verbs Textarea state
  const [verbsText, setVerbsText] = useState("");
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  
  // Loading transitions
  const [isUpdatingVerbs, setIsUpdatingVerbs] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  // Active states
  const [generatingLessonId, setGeneratingLessonId] = useState<string | null>(null);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [editingCourseIndex, setEditingCourseIndex] = useState<number | null>(null);
  const [tempEditText, setTempEditText] = useState("");

  // Bulk processing states for sequentially calling suggestion API
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("");
  const [savingSubitems, setSavingSubitems] = useState<Record<string, boolean>>({});

  function refreshAll() {
    fetchBloomSession()
      .then((sess) => setSession(sess))
      .catch(() => setSession(EMPTY_SESSION));

    fetchBloomState()
      .then((st) => setState(st))
      .catch(() => {});
  }

  useEffect(() => {
    refreshAll();
  }, []);

  // Sync state verbs into verbsText on load or change
  useEffect(() => {
    if (state?.verbs) {
      setVerbsText(state.verbs.join(", "));
    }
  }, [state?.verbs]);

  const isReady = session.cdr_status === "ready" && session.gt_status === "ready";

  const numLessonsWithSuggestions = state
    ? Object.keys(state.lesson_suggestions).length
    : 0;
  const totalLessons = session?.lessons?.length || 0;
  const hasSomeSuggestions = numLessonsWithSuggestions > 0;
  const hasAllSuggestions = numLessonsWithSuggestions === totalLessons;

  // Dedicated upload handlers
  function handleUploadCdr(file: File) {
    setUploadingCdr(true);
    setUploadError(null);
    setFeedback(null);
    uploadBloomCdr(file)
      .then((sess) => {
        setSession(sess);
        setFeedback({ message: "Đã tải lên & xử lý cấu trúc CDR mẫu thành công!", type: "success" });
      })
      .catch((err) => {
        setUploadError(err.message || "Tải file CDR thất bại");
      })
      .finally(() => {
        setUploadingCdr(false);
      });
  }

  function handleUploadGt(file: File) {
    setUploadingGt(true);
    setUploadError(null);
    setFeedback(null);
    uploadBloomGt(file)
      .then((sess) => {
        setSession(sess);
        setFeedback({ message: "Đã tải lên & ánh xạ Giáo trình thành công!", type: "success" });
      })
      .catch((err) => {
        setUploadError(err.message || "Tải file Giáo trình thất bại");
      })
      .finally(() => {
        setUploadingGt(false);
      });
  }

  // Save verbs bulk update
  function handleSaveVerbsFromTextarea() {
    if (!state) return;
    const splitVerbs = verbsText
      .split(/[,\n]/)
      .map((v) => v.trim())
      .filter(Boolean);

    setIsUpdatingVerbs(true);
    updateBloomVerbs(splitVerbs)
      .then((next) => {
        setState(next);
        setFeedback({ message: "Đã cập nhật danh sách động từ Bloom thành công!", type: "success" });
      })
      .catch((err) => {
        setFeedback({ message: `Lỗi cập nhật danh sách: ${err.message}`, type: "error" });
      })
      .finally(() => {
        setIsUpdatingVerbs(false);
      });
  }

  // Suggest Outcomes for individual Lesson
  function handleGenerateLesson(lessonId: string) {
    setGeneratingLessonId(lessonId);
    setFeedback(null);
    generateLessonSuggestions(lessonId)
      .then((result) => {
        setState(result.state);
        setFeedback({ message: "Phát hiện chi tiết bài giảng và gợi ý chuẩn đầu ra Bloom thành công!", type: "success" });
      })
      .catch((err) => {
        setFeedback({ message: `Lỗi khi sinh chuẩn đầu ra: ${err.message}`, type: "error" });
      })
      .finally(() => {
        setGeneratingLessonId(null);
      });
  }

  // Rate-limit safe bulk generator for all lessons using single-batch request
  async function handleBulkGenerate(forceAll = false) {
    if (!session || session.lessons.length === 0) return;
    setBulkProcessing(true);
    setFeedback(null);

    const total = session.lessons.length;
    const lessonsToGen: string[] = [];

    for (let i = 0; i < total; i++) {
      const lesson = session.lessons[i];
      const lSugs = state?.lesson_suggestions?.[lesson.id] || [];
      if (forceAll || lSugs.length === 0) {
        lessonsToGen.push(lesson.id);
      }
    }

    if (lessonsToGen.length === 0) {
      setBulkProcessing(false);
      setFeedback({
        message: "Tất cả các bài học đã có thông tin gợi ý Chuẩn đầu ra Bloom và được bảo lưu.",
        type: "info"
      });
      return;
    }

    setBulkStatus(`Đang tối ưu chuẩn Bloom song song cho ${lessonsToGen.length} bài học. Hệ thống sẽ gom thành từng đợt 5 bài trong 1 yêu cầu duy nhất để triệt tiêu lỗi Quota Exceeded (429)...`);

    try {
      const result = await generateBulkLessonsSuggestions(lessonsToGen);
      setState(result.state);
      setBulkProcessing(false);
      setBulkStatus("");
      setFeedback({
        message: `Đã hoàn thành đề xuất Chuẩn đầu ra Bloom thành công cho ${lessonsToGen.length} bài học!`,
        type: "success"
      });
    } catch (err: any) {
      console.error(`Lỗi sinh hàng loạt: ${err.message}`);
      setBulkProcessing(false);
      setBulkStatus("");
      setFeedback({
        message: `Lỗi khi sinh chuẩn đầu ra hàng loạt: ${err.message}`,
        type: "error"
      });
    }
  }

  // Toggle outline checkboxes for a lesson outcome suggestion
  function handleToggleLessonOutcome(lessonId: string, item: string) {
    if (!state) return;
    const currentSelected = state.selected_outcomes[lessonId] || [];
    let next: string[];
    if (currentSelected.includes(item)) {
      next = currentSelected.filter((o) => o !== item);
    } else {
      next = [...currentSelected, item];
    }

    selectLessonOutcomes(lessonId, next)
      .then((nextState) => {
        setState(nextState);
      })
      .catch((err) => {
        setFeedback({ message: `Lỗi khi lưu lựa chọn: ${err.message}`, type: "error" });
      });
  }

  // Edit suggestion text
  function startEditingLesson(lessonId: string, value: string) {
    setEditingLessonId(lessonId);
    setTempEditText(value);
  }

  function saveEditingLesson(lessonId: string, originalValue: string) {
    if (!state) return;
    const currentSugs = state.lesson_suggestions[lessonId] || [];
    const valClean = tempEditText.trim();
    if (!valClean) {
      setEditingLessonId(null);
      return;
    }

    const updatedSugs = currentSugs.map((s) => (s === originalValue ? valClean : s));
    const currentSelected = state.selected_outcomes[lessonId] || [];
    const updatedSelected = currentSelected.map((s) => (s === originalValue ? valClean : s));

    // Optimistic state
    state.lesson_suggestions[lessonId] = updatedSugs;
    state.selected_outcomes[lessonId] = updatedSelected;

    selectLessonOutcomes(lessonId, updatedSelected)
      .then((next) => {
        setState(next);
        setEditingLessonId(null);
        setFeedback({ message: "Đã cập nhật nội dung chuẩn đầu ra bài giảng.", type: "success" });
      })
      .catch((err) => {
        setFeedback({ message: `Lỗi cập nhật: ${err.message}`, type: "error" });
      });
  }

  // Synthesize Course overall Outcomes
  function handleSynthesizeCourse() {
    setFeedback(null);
    setIsSynthesizing(true);
    generateCourseSuggestions()
      .then((result) => {
        setState(result.state);
        setFeedback({ message: "Đã tổng hợp thành công Chuẩn đầu ra Môn học CLO!", type: "success" });
      })
      .catch((err) => {
        setFeedback({ message: `Không thể tổng hợp học phần CLO: ${err.message}`, type: "error" });
      })
      .finally(() => {
        setIsSynthesizing(false);
      });
  }

  // Reset workspace state
  function handleReset() {
    if (!window.confirm("Bạn có chắc muốn Reset sạch toàn bộ gợi ý tối ưu Bloom hiện tại?")) return;
    setIsResetting(true);
    resetBloomState()
      .then((next) => {
        setState(next);
        setSession(EMPTY_SESSION);
        setFeedback({ message: "Đã dọn sạch phân tích tối ưu Bloom.", type: "info" });
      })
      .catch(() => {})
      .finally(() => {
        setIsResetting(false);
      });
  }

  // Exporter
  function handleExport() {
    setFeedback(null);
    setIsExporting(true);
    exportBloomCdrBlob()
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", "CDR_ChuanHoa_Bloom.docx");
        document.body.appendChild(link);
        link.click();
        link.remove();
        setFeedback({ message: "Đã tích hợp, tạo tài liệu và xuất file CDR Bloom (.docx) thành công!", type: "success" });
      })
      .catch((err) => {
        setFeedback({ message: `Lỗi biên dịch & xuất CDR: ${err.message}`, type: "error" });
      })
      .finally(() => {
        setIsExporting(false);
      });
  }

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl mx-auto">
        
        {/* INDEPENDENT DECOUPLED FILE UPLOAD COMPONENT */}
        <div className="bg-white rounded-[24px] border border-sage-border p-6 shadow-sm space-y-4">
          <div className="border-b border-sage-border pb-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1">
              <h4 className="font-bold text-accent flex items-center gap-2">
                <Settings className="w-5 h-5 text-accent" />
                <span>Nạp tài liệu tối ưu CDR (Tách biệt hoàn toàn)</span>
              </h4>
              <p className="text-xs text-ink/65">
                Trình nạp file độc lập cho xưởng Bloom • Giáo trình và Khung mẫu không làm ảnh hưởng đến Trang chủ.
              </p>
            </div>
            <div className="flex items-center gap-2.5 self-end md:self-auto">
              <button
                onClick={refreshAll}
                className="p-2 text-ink hover:bg-sage-hover rounded-xl border border-sage-border/30 bg-white transition-colors flex items-center justify-center cursor-pointer shadow-2xs"
                title="Làm mới trạng thái"
                type="button"
              >
                <RefreshCw className="w-4 h-4 opacity-70" />
              </button>
              {state && (
                <button
                  onClick={handleReset}
                  disabled={isResetting}
                  className="px-4 py-2 text-xs font-bold text-red-600 border border-red-200 hover:bg-red-50 bg-white rounded-xl transition-all cursor-pointer disabled:opacity-50"
                  type="button"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* CDR FILE INPUT */}
            <div className="p-4 rounded-2xl border border-dashed border-sage-border/60 bg-[#FAF9F6] space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-accent uppercase font-serif">1. File Khung CDR mẫu (.docx)</span>
                  {session.cdr_status === "ready" ? (
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">Sẵn sàng</span>
                  ) : session.cdr_status === "preparing" || uploadingCdr ? (
                    <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full animate-pulse">Đang nạp...</span>
                  ) : (
                    <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full">Chưa có</span>
                  )}
                </div>
                <p className="text-[11px] text-ink/60 mt-1 lines-clamp-2">
                  File chứa danh mục khung bài học và danh sách chuẩn đầu ra gốc cần được chỉnh sửa.
                </p>
                {session.cdr_file_name && (
                  <div className="mt-2 text-xs font-medium text-emerald-700 font-mono truncate">
                    📄 {session.cdr_file_name}
                  </div>
                )}
              </div>

              <div>
                <input
                  id="bloom-cdr-file-input"
                  type="file"
                  accept=".docx"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadCdr(file);
                  }}
                />
                <button
                  type="button"
                  disabled={uploadingCdr}
                  onClick={() => document.getElementById("bloom-cdr-file-input")?.click()}
                  className="w-full mt-2 text-xs font-semibold py-2 px-3 border border-accent bg-white text-accent hover:bg-sage-hover rounded-xl transition-colors disabled:opacity-50"
                >
                  {uploadingCdr ? "Đang xử lý tài liệu..." : "Chọn File CDR"}
                </button>
              </div>
            </div>

            {/* GIÁO TRÌNH FILE INPUT */}
            <div className="p-4 rounded-2xl border border-dashed border-sage-border/60 bg-[#FAF9F6] space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-accent uppercase font-serif">2. File Giáo trình bài giảng (.docx)</span>
                  {session.gt_status === "ready" ? (
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">Sẵn sàng</span>
                  ) : session.gt_status === "preparing" || uploadingGt ? (
                    <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full animate-pulse">Đang nạp...</span>
                  ) : (
                    <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full">Chưa có</span>
                  )}
                </div>
                <p className="text-[11px] text-ink/60 mt-1 lines-clamp-2">
                  File chứa nội dung kiến thức chi tiết của các chương để đối chiếu phân tích.
                </p>
                {session.gt_file_name && (
                  <div className="mt-2 text-xs font-medium text-emerald-700 font-mono truncate">
                    📄 {session.gt_file_name}
                  </div>
                )}
              </div>

              <div>
                <input
                  id="bloom-gt-file-input"
                  type="file"
                  accept=".docx"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadGt(file);
                  }}
                />
                <button
                  type="button"
                  disabled={uploadingGt || session.cdr_status !== "ready"}
                  onClick={() => document.getElementById("bloom-gt-file-input")?.click()}
                  className="w-full mt-2 text-xs font-semibold py-2 px-3 border border-accent bg-white text-accent hover:bg-sage-hover rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={session.cdr_status !== "ready" ? "Vui lòng tải file CDR lên trước" : ""}
                >
                  {uploadingGt ? "Đang xử lý tài liệu..." : "Chọn File Giáo trình"}
                </button>
              </div>
            </div>
          </div>

          {uploadError && (
            <div className="text-xs text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}
        </div>

        {/* NOTIFICATION FEEDBACK */}
        {feedback && (
          <div
            className={`p-4 rounded-xl border text-sm flex items-start gap-3 shadow-xs ${
              feedback.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : feedback.type === "error"
                  ? "bg-red-50 border-red-200 text-red-800"
                  : "bg-blue-50 border-blue-200 text-blue-800"
            }`}
          >
            <Sparkles className="w-5 h-5 flex-shrink-0 mt-0.5 text-accent" />
            <div className="flex-1">{feedback.message}</div>
          </div>
        )}

        {/* WORKSPACE SECTIONS */}
        {!isReady ? (
          <div className="bg-[#FAF8F5] rounded-[24px] border border-sage-border p-10 text-center space-y-3">
            <HelpCircle className="w-12 h-12 text-[#7A3E2A] mx-auto opacity-70" />
            <h3 className="text-lg font-serif font-bold text-[#5C2B1B]">Cơ sở dữ liệu xưởng chưa sẵn sàng</h3>
            <p className="text-xs text-[#7D5A4F] max-w-xl mx-auto leading-relaxed">
              Vui lòng sử dụng bộ nạp độc lập ở phía trên để tải lên cả file <b>Khung CDR (.docx)</b> và file <b>Giáo trình (.docx)</b>. Hệ thống AI sẽ tự động phân rã khung bài học và kích hoạt xưởng tối ưu.
            </p>
          </div>
        ) : (
          <div className="space-y-8 max-w-7xl mx-auto">
            {/* COMPREHENSIVE OVERVIEW STATUS BAR CARD */}
            {state && (
              <div className="bg-[#FAF8F5] rounded-[24px] border border-sage-border p-5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm animate-fade-in">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-accent/5 rounded-2xl border border-accent/15">
                    <Sparkles className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <h4 className="font-bold font-serif text-accent text-sm md:text-base">Xưởng Chuẩn Hóa Bloom Studio</h4>
                    <p className="text-xs text-ink/65">
                      Bản thiết kế mục tiêu bài học kỹ thuật học thức chuẩn Bloom bám sát chương Giáo trình.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="text-xs bg-white border border-sage-border px-3 py-1.5 rounded-xl">
                    Bài học đã tối ưu: <strong className="text-accent">{numLessonsWithSuggestions} / {session.lessons.length}</strong>
                  </div>
                  
                  {state.course_suggestions.length > 0 && (
                    <button
                      onClick={handleExport}
                      disabled={isExporting}
                      className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-xl text-xs transition-all shadow-sm"
                    >
                      {isExporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                      <span>Tải CDR Tối ưu (.docx)</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* RIGHT COLUMN: Optimization Workspace */}
            <div className="space-y-6">
              
              {/* STEP 1: Lesson Outcomes */}
              <div className="bg-white rounded-[24px] border border-sage-border p-6 space-y-6 shadow-sm">
                <div className="border-b border-sage-border pb-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] bg-accent/10 px-2.5 py-1 rounded-full text-accent font-bold tracking-wider font-mono uppercase">
                        BƯỚC 1
                      </span>
                    </div>
                    <h4 className="text-xl font-serif font-black text-accent mt-0.5">
                      Sinh chuẩn đầu ra của từng bài học
                    </h4>
                    <p className="text-xs text-ink/60">
                      Sử dụng AI phân rã chuẩn Bloom bám sát nội dung từng chương bài giảng.
                    </p>
                  </div>

                  {/* Bulk Action Button with rate-limit status */}
                  <div className="flex flex-col sm:items-end gap-2 flex-shrink-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {hasSomeSuggestions && !hasAllSuggestions && (
                        <button
                          type="button"
                          disabled={bulkProcessing || generatingLessonId !== null || session.lessons.length === 0}
                          onClick={() => handleBulkGenerate(false)}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Sinh tiếp các bài chưa có ({totalLessons - numLessonsWithSuggestions})</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={bulkProcessing || generatingLessonId !== null || session.lessons.length === 0}
                        onClick={() => handleBulkGenerate(hasSomeSuggestions ? true : false)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer ${
                          hasSomeSuggestions
                            ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                            : "bg-accent hover:bg-sage-dark text-white"
                        }`}
                      >
                        {bulkProcessing ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Đang sinh gợi ý...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                            <span>{hasSomeSuggestions ? "Sinh lại toàn bộ bài học" : "Gợi ý CDR tất cả các bài học"}</span>
                          </>
                        )}
                      </button>
                    </div>
                    {bulkProcessing && (
                      <span className="text-[10px] h-3.5 font-mono text-accent bg-accent/5 px-2 py-0.5 rounded-sm animate-pulse max-w-sm truncate text-right">
                        {bulkStatus}
                      </span>
                    )}
                  </div>
                </div>

                <div className="divide-y divide-sage-border/50">
                  {session.lessons.map((lesson) => {
                    const lSugs = state?.lesson_suggestions[lesson.id] || [];
                    const lSelected = state?.selected_outcomes[lesson.id] || [];
                    const isGeneratingThis = generatingLessonId === lesson.id;
                    const hasSugs = lSugs.length > 0;

                    return (
                      <div
                        key={lesson.id}
                        className="py-6 first:pt-2 last:pb-2 space-y-6 animate-fade-in"
                      >
                        {/* Elegant Flat Lesson Header Stripe */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-sage-light/35 p-4 rounded-2xl border border-sage-border/20">
                          <div className="space-y-0.5">
                            <h5 className="font-bold text-ink flex items-center gap-2 text-base">
                              <span className="font-serif text-accent text-lg">Bài {lesson.lesson_number}:</span>
                              <span className="text-accent/90">{cleanLessonTitle(lesson.title, lesson.lesson_number)}</span>
                            </h5>
                            {lesson.chapter_title && (
                              <p className="text-xs text-ink/50 ml-1">
                                Ánh xạ: Ch.{lesson.chapter_number} - {lesson.chapter_title}
                              </p>
                            )}
                          </div>

                          <button
                            onClick={() => handleGenerateLesson(lesson.id)}
                            disabled={generatingLessonId !== null || bulkProcessing}
                            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
                              hasSugs
                                ? "bg-sage-light text-accent border border-sage-border hover:bg-sage-hover"
                                : "bg-accent text-white hover:bg-sage-dark shadow-xs"
                            }`}
                          >
                            {isGeneratingThis ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>Đang sinh...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>{hasSugs ? "Sinh lại gợi ý" : "Gợi ý CDR"}</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* OUTCOMES SUGGESTIONS PANEL - Flat UI, no nested box borders */}
                        {hasSugs ? (
                          <div className="space-y-7 pl-1 md:pl-3">
                            {lSugs.map((item) => (
                              <BloomSubitemEditor
                                key={item.subitemKey}
                                lessonId={lesson.id}
                                item={item}
                                state={state}
                                setState={setState}
                                setFeedback={setFeedback}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-ink/40 italic flex items-center gap-1.5 pl-4">
                            <HelpCircle className="w-3.5 h-3.5 text-ink/30" />
                            <span>Chưa sinh gợi ý cho bài học này. Vui lòng bấm "Gợi ý CDR" để kích hoạt AI.</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* STEP 2: Course Outcomes */}
              <div className="bg-white rounded-[24px] border border-sage-border p-6 space-y-6 shadow-sm">
                <div className="border-b border-sage-border pb-4 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <span className="text-[11px] bg-[#D4E2CD] px-2.5 py-1 rounded-full text-accent font-semibold tracking-wider font-mono uppercase">
                      BƯỚC 2
                    </span>
                    <h4 className="text-xl font-serif font-bold text-accent mt-1">
                      Tổng hợp chuẩn đầu ra môn học của toàn học phần (CLO)
                    </h4>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-sm text-ink/70 leading-relaxed">
                    Sử dụng các mốc chuẩn đầu ra của từng chương học mà bạn đã chọn lọc ở Bước 1 nhằm khái quát hóa tối đa thành từ 4 đến 6 chuẩn đầu ra toàn diện của học phần môn học.
                  </p>

                  <div className="bg-[#FAFBF9] rounded-2xl p-5 border border-sage-border/40 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="text-sm">
                      <span className="text-ink/60">Bài giảng đã được tối ưu hóa: </span>
                      <b className="text-[#4B5E40]">{numLessonsWithSuggestions} bài giảng</b>
                    </div>

                    <button
                      onClick={handleSynthesizeCourse}
                      disabled={numLessonsWithSuggestions < 1 || isSynthesizing}
                      className="px-6 py-2.5 text-sm bg-accent hover:bg-sage-dark text-white rounded-xl font-bold transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {isSynthesizing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Đang tổng hợp môn học...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>Tổng hợp CLO môn học</span>
                        </>
                      )}
                    </button>
                  </div>

                  {state && state.course_suggestions.length > 0 && (
                    <div className="space-y-6 pt-3">
                      <span className="text-xs font-bold text-ink/50 uppercase tracking-widest block">
                        Các CLO tổng hợp đề xuất chia theo nhóm Kiến thức, Kỹ năng, Tự chủ & Trách nhiệm:
                      </span>
                      
                      {[
                        { title: "Kiến thức", key: "knowledge" as const },
                        { title: "Kỹ năng", key: "skills" as const },
                        { title: "Mức tự chủ và trách nhiệm", key: "autonomy" as const }
                      ].map((grp) => {
                        const grpItems = state.course_suggestions.filter(it => it.category === grp.key);
                        if (grpItems.length === 0) return null;

                        return (
                          <div key={grp.key} className="space-y-3">
                            <h5 className="font-bold text-accent font-serif text-base border-l-2 border-accent pl-2.5">
                              {grp.title}
                            </h5>
                            
                            <div className="space-y-6">
                              {grpItems.map((item) => (
                                <BloomCourseSubitemEditor
                                  key={item.subitemKey}
                                  item={item}
                                  state={state}
                                  setState={setState}
                                  setFeedback={setFeedback}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* PERSISTENT DOWNLOAD BUTTON AT THE BOTTOM */}
              {state && state.course_suggestions.length > 0 && (
                <div className="bg-[#FAF8F5] rounded-[24px] border border-sage-border p-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm animate-fade-in">
                  <div>
                    <h5 className="font-bold text-accent font-serif text-base">Hoàn thành tất cả các bước chuẩn hóa?</h5>
                    <p className="text-xs text-ink/65">Xuất bản đề cương chi tiết học phần đã tối ưu hóa sang định dạng Word .docx</p>
                  </div>
                  <button
                    onClick={handleExport}
                    disabled={isExporting}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-xl text-sm transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    {isExporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                    <span>Tải CDR Tối ưu (.docx)</span>
                  </button>
                </div>
              )}

            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}

// --- HIGHLY-RESPONSIVE SUB-COMPONENTS WITH DECOUPLED TYPING STATE (NO LAG / FOCUS HIGHLIGHTS) ---

interface BloomSubitemEditorProps {
  key?: string | number | null;
  lessonId: string;
  item: BloomSuggestionItem;
  state: BloomState | null;
  setState: React.Dispatch<React.SetStateAction<BloomState | null>>;
  setFeedback: (fb: { message: string; type: "success" | "error" | "info" } | null) => void;
}

function BloomSubitemEditor({ lessonId, item, state, setState, setFeedback }: BloomSubitemEditorProps) {
  const [inputValue, setInputValue] = useState(item.selectedSuggestion || "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setInputValue(item.selectedSuggestion || "");
  }, [item.selectedSuggestion]);

  const handleSelectOption = (optionText: string) => {
    if (isSaving) return;
    setIsSaving(true);
    setInputValue(optionText);
    if (state) {
      const list = state.lesson_suggestions[lessonId] || [];
      const updatedList = list.map(it =>
        it.subitemKey === item.subitemKey ? { ...it, selectedSuggestion: optionText } : it
      );
      setState({
        ...state,
        lesson_suggestions: {
          ...state.lesson_suggestions,
          [lessonId]: updatedList
        }
      });
    }
    selectBloomSubitem(lessonId, item.subitemKey, optionText)
      .then((nextState) => {
        setState(currentState => {
          if (!currentState) return nextState;
          // Synchronize and merge suggestions, keeping any newer choice the user made in local state
          const mergedLessonSuggestions = { ...nextState.lesson_suggestions };
          Object.keys(currentState.lesson_suggestions).forEach(lId => {
            const curList = currentState.lesson_suggestions[lId] || [];
            const nList = mergedLessonSuggestions[lId] || [];
            mergedLessonSuggestions[lId] = nList.map(nItem => {
              const curItem = curList.find(c => c.subitemKey === nItem.subitemKey);
              if (curItem && curItem.selectedSuggestion !== nItem.selectedSuggestion) {
                return { ...nItem, selectedSuggestion: curItem.selectedSuggestion };
              }
              return nItem;
            });
          });
          return {
            ...nextState,
            lesson_suggestions: mergedLessonSuggestions
          };
        });
      })
      .catch((err) => setFeedback({ message: `Lỗi lưu lựa chọn: ${err.message}`, type: "error" }))
      .finally(() => setIsSaving(false));
  };

  const handleSaveEdit = (val: string) => {
    if (val === item.selectedSuggestion || isSaving) return;
    setIsSaving(true);
    if (state) {
      const list = state.lesson_suggestions[lessonId] || [];
      const updatedList = list.map(it =>
        it.subitemKey === item.subitemKey ? { ...it, selectedSuggestion: val } : it
      );
      setState({
        ...state,
        lesson_suggestions: {
          ...state.lesson_suggestions,
          [lessonId]: updatedList
        }
      });
    }
    selectBloomSubitem(lessonId, item.subitemKey, val)
      .then((nextState) => {
        setState(currentState => {
          if (!currentState) return nextState;
          const mergedLessonSuggestions = { ...nextState.lesson_suggestions };
          Object.keys(currentState.lesson_suggestions).forEach(lId => {
            const curList = currentState.lesson_suggestions[lId] || [];
            const nList = mergedLessonSuggestions[lId] || [];
            mergedLessonSuggestions[lId] = nList.map(nItem => {
              const curItem = curList.find(c => c.subitemKey === nItem.subitemKey);
              if (curItem && curItem.selectedSuggestion !== nItem.selectedSuggestion) {
                return { ...nItem, selectedSuggestion: curItem.selectedSuggestion };
              }
              return nItem;
            });
          });
          return {
            ...nextState,
            lesson_suggestions: mergedLessonSuggestions
          };
        });
      })
      .catch((err) => setFeedback({ message: `Lỗi lưu lựa chọn: ${err.message}`, type: "error" }))
      .finally(() => setIsSaving(false));
  };

  return (
    <div className={`border-l-2 pl-4 py-1 space-y-3.5 transition-opacity ${isSaving ? "border-accent/40 opacity-75" : "border-accent/25"}`}>
      <div className="flex items-start justify-between gap-3 pb-0.5">
        <div>
          <span className="text-[10px] font-mono font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-md uppercase tracking-wider">
            {item.category === "knowledge" ? "Kiến thức" : item.category === "skills" ? "Kỹ năng" : "Tự chủ & Trách nhiệm"} ({item.subitemKey})
          </span>
          <p className="text-sm text-ink/80 italic mt-2.5 leading-relaxed">
            Mục tiêu gốc: <span className="font-semibold not-italic text-ink">{item.originalText}</span>
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-[10px] font-bold text-ink/40 uppercase tracking-widest block">
          Phương án đề xuất bám sát Bloom bài học:
        </span>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {item.suggestions.map((optionText, idx) => {
            const isOptionSelected = item.selectedSuggestion === optionText;
            return (
              <button
                key={idx}
                type="button"
                disabled={isSaving}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevents input focus losses & race-conditions!
                  handleSelectOption(optionText);
                }}
                className={`p-4 text-left rounded-xl border text-xs font-medium transition-all flex flex-col justify-between cursor-pointer group ${
                  isOptionSelected
                    ? "bg-accent border-accent text-white shadow-xs"
                    : "bg-[#FCFCFA] border-slate-200 text-ink/80 hover:bg-sage-hover hover:border-sage-border/70"
                } ${isSaving ? "cursor-not-allowed opacity-80" : ""}`}
              >
                <span className="leading-relaxed">{optionText}</span>
                <span className={`text-[9px] font-bold tracking-wider mt-3 block text-right uppercase ${
                  isOptionSelected ? "text-white/60" : "text-ink/30 group-hover:text-ink/50"
                }`}>
                  {isSaving && isOptionSelected ? "Đang lưu..." : `Gợi ý ${idx + 1}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-2 flex items-center gap-3">
        <label className="text-xs font-bold text-ink/50 uppercase whitespace-nowrap">Hiệu chỉnh:</label>
        <input
          type="text"
          value={inputValue}
          disabled={isSaving}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={() => handleSaveEdit(inputValue)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSaveEdit(inputValue);
              e.currentTarget.blur();
            }
          }}
          className="flex-1 px-3.5 py-2 text-xs border border-slate-200 rounded-xl bg-[#FAFAF8]/70 focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent disabled:opacity-50"
        />
      </div>
    </div>
  );
}

interface BloomCourseSubitemEditorProps {
  key?: string | number | null;
  item: BloomSuggestionItem;
  state: BloomState | null;
  setState: React.Dispatch<React.SetStateAction<BloomState | null>>;
  setFeedback: (fb: { message: string; type: "success" | "error" | "info" } | null) => void;
}

function BloomCourseSubitemEditor({ item, state, setState, setFeedback }: BloomCourseSubitemEditorProps) {
  const [inputValue, setInputValue] = useState(item.selectedSuggestion || "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setInputValue(item.selectedSuggestion || "");
  }, [item.selectedSuggestion]);

  const handleSelectOption = (optionText: string) => {
    if (isSaving) return;
    setIsSaving(true);
    setInputValue(optionText);
    if (state) {
      const updated = { ...item, selectedSuggestion: optionText };
      const updatedList = state.course_suggestions.map(it => it.subitemKey === item.subitemKey ? updated : it);
      setState({
        ...state,
        course_suggestions: updatedList
      });
    }
    selectBloomCourseSubitem(item.subitemKey, optionText)
      .then((nextState) => {
        setState(currentState => {
          if (!currentState) return nextState;
          // Merge to preserve newer / other selections
          const mergedCourseSuggestions = nextState.course_suggestions.map(nItem => {
            const curItem = currentState.course_suggestions.find(c => c.subitemKey === nItem.subitemKey);
            if (curItem && curItem.selectedSuggestion !== nItem.selectedSuggestion) {
              return { ...nItem, selectedSuggestion: curItem.selectedSuggestion };
            }
            return nItem;
          });
          return {
            ...nextState,
            course_suggestions: mergedCourseSuggestions
          };
        });
      })
      .catch((err) => setFeedback({ message: `Lỗi lưu lựa chọn CLO: ${err.message}`, type: "error" }))
      .finally(() => setIsSaving(false));
  };

  const handleSaveEdit = (val: string) => {
    if (val === item.selectedSuggestion || isSaving) return;
    setIsSaving(true);
    if (state) {
      const updated = { ...item, selectedSuggestion: val };
      const updatedList = state.course_suggestions.map(it => it.subitemKey === item.subitemKey ? updated : it);
      setState({
        ...state,
        course_suggestions: updatedList
      });
    }
    selectBloomCourseSubitem(item.subitemKey, val)
      .then((nextState) => {
        setState(currentState => {
          if (!currentState) return nextState;
          const mergedCourseSuggestions = nextState.course_suggestions.map(nItem => {
            const curItem = currentState.course_suggestions.find(c => c.subitemKey === nItem.subitemKey);
            if (curItem && curItem.selectedSuggestion !== nItem.selectedSuggestion) {
              return { ...nItem, selectedSuggestion: curItem.selectedSuggestion };
            }
            return nItem;
          });
          return {
            ...nextState,
            course_suggestions: mergedCourseSuggestions
          };
        });
      })
      .catch((err) => setFeedback({ message: `Lỗi lưu lựa chọn CLO: ${err.message}`, type: "error" }))
      .finally(() => setIsSaving(false));
  };

  return (
    <div className={`border-l-2 pl-4 py-1 space-y-3.5 transition-opacity ${isSaving ? "border-accent/40 opacity-75" : "border-accent/25"}`}>
      <div className="flex items-start justify-between gap-3 pb-0.5">
        <div>
          <span className="text-[10px] font-mono font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-md uppercase tracking-wider">
            Tiểu mục chuẩn đầu ra CLO {item.subitemKey}
          </span>
          {item.originalText && (
            <p className="text-sm text-ink/80 italic mt-2.5 leading-relaxed">
              Nội dung gốc: <span className="font-semibold not-italic text-ink">{item.originalText}</span>
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-[10px] font-bold text-ink/40 uppercase tracking-widest block">
          Phương án đề xuất bám sát Bloom chung:
        </span>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {item.suggestions.map((optionText, idx) => {
            const isOptionSelected = item.selectedSuggestion === optionText;
            return (
              <button
                key={idx}
                type="button"
                disabled={isSaving}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevents input focus loss & race-condition!
                  handleSelectOption(optionText);
                }}
                className={`p-4 text-left rounded-xl border text-xs font-medium transition-all flex flex-col justify-between cursor-pointer group ${
                  isOptionSelected
                    ? "bg-accent border-accent text-white shadow-xs"
                    : "bg-[#FCFCFA] border-slate-200 text-ink/80 hover:bg-sage-hover hover:border-sage-border/70"
                } ${isSaving ? "cursor-not-allowed opacity-80" : ""}`}
              >
                <span className="leading-relaxed">{optionText}</span>
                <span className={`text-[9px] font-bold tracking-wider mt-3 block text-right uppercase ${
                  isOptionSelected ? "text-white/60" : "text-ink/30 group-hover:text-ink/50"
                }`}>
                  {isSaving && isOptionSelected ? "Đang lưu..." : `Gợi ý ${idx + 1}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-2 flex items-center gap-3">
        <label className="text-xs font-bold text-ink/50 uppercase whitespace-nowrap">Hiệu chỉnh:</label>
        <input
          type="text"
          value={inputValue}
          disabled={isSaving}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={() => handleSaveEdit(inputValue)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSaveEdit(inputValue);
              e.currentTarget.blur();
            }
          }}
          className="flex-1 px-3.5 py-2 text-xs border border-slate-200 rounded-xl bg-[#FAFAF8]/70 focus:bg-white focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent disabled:opacity-50"
        />
      </div>
    </div>
  );
}
