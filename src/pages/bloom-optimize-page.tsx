import { useEffect, useState, useTransition } from "react";
import { Layout } from "../components/layout";
import {
  fetchBloomSession,
  uploadBloomCdr,
  uploadBloomGt,
  fetchBloomState,
  updateBloomVerbs,
  generateLessonSuggestions,
  selectLessonOutcomes,
  selectBloomSubitem,
  generateCourseSuggestions,
  selectCourseOutcomes,
  selectBloomCourseSubitem,
  resetBloomState,
  exportBloomCdrBlob,
  type BloomState
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
    const regex = /^\s*bài\s+\d+\s*[:.-]*\s*/i;
    return title.replace(regex, "").trim();
  };
  
  // Independent uploading states
  const [uploadingCdr, setUploadingCdr] = useState(false);
  const [uploadingGt, setUploadingGt] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Verbs Textarea state
  const [verbsText, setVerbsText] = useState("");
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  
  // Loading transitions
  const [isUpdatingVerbs, startVotingVerbs] = useTransition();
  const [isResetting, startResetting] = useTransition();
  const [isSynthesizing, startSynthesizing] = useTransition();
  const [isExporting, startExporting] = useTransition();
  
  // Active states
  const [generatingLessonId, setGeneratingLessonId] = useState<string | null>(null);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [editingCourseIndex, setEditingCourseIndex] = useState<number | null>(null);
  const [tempEditText, setTempEditText] = useState("");

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

    startVotingVerbs(() => {
      updateBloomVerbs(splitVerbs)
        .then((next) => {
          setState(next);
          setFeedback({ message: "Đã cập nhật danh sách động từ Bloom thành công!", type: "success" });
        })
        .catch((err) => {
          setFeedback({ message: `Lỗi cập nhật danh sách: ${err.message}`, type: "error" });
        });
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
    startSynthesizing(() => {
      generateCourseSuggestions()
        .then((result) => {
          setState(result.state);
          setFeedback({ message: "Đã tổng hợp thành công Chuẩn đầu ra Môn học CLO!", type: "success" });
        })
        .catch((err) => {
          setFeedback({ message: `Không thể tổng hợp học phần CLO: ${err.message}`, type: "error" });
        });
    });
  }

  // Reset workspace state
  function handleReset() {
    if (!window.confirm("Bạn có chắc muốn Reset sạch toàn bộ gợi ý tối ưu Bloom hiện tại?")) return;
    startResetting(() => {
      resetBloomState()
        .then((next) => {
          setState(next);
          setSession(EMPTY_SESSION);
          setFeedback({ message: "Đã dọn sạch phân tích tối ưu Bloom.", type: "info" });
        })
        .catch(() => {});
    });
  }

  // Exporter
  function handleExport() {
    setFeedback(null);
    startExporting(() => {
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
        });
    });
  }

  return (
    <Layout
      title="Xưởng Tối Ưu Hóa Chuẩn Đầu Ra (Bloom CDR Studio)"
      subtitle="Bản thiết kế mục tiêu bài học kỹ thuật học thức chuẩn Bloom"
      headerActions={
        <div className="flex items-center gap-2">
          <button
            onClick={refreshAll}
            className="p-2 text-ink hover:bg-sage-hover rounded-xl transition-colors"
            title="Làm mới trạng thái"
          >
            <RefreshCw className="w-5 h-5 opacity-70" />
          </button>
          {state && (
            <button
              onClick={handleReset}
              disabled={isResetting}
              className="px-3 py-1.5 text-xs text-red-600 border border-red-200 hover:bg-red-50 rounded-xl transition-all"
            >
              Reset
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-6 max-w-7xl mx-auto">
        
        {/* INDEPENDENT DECOUPLED FILE UPLOAD COMPONENT */}
        <div className="bg-white rounded-[24px] border border-sage-border p-6 shadow-sm space-y-4">
          <div className="border-b border-sage-border pb-3">
            <h4 className="font-bold text-accent flex items-center gap-2">
              <Settings className="w-5 h-5 text-accent" />
              <span>Nạp tài liệu tối ưu CDR (Tách biệt hoàn toàn)</span>
            </h4>
            <p className="text-xs text-ink/65 mt-0.5">
              Trình nạp file độc lập cho xưởng Bloom. Các tài liệu nạp tại đây sẽ không làm ảnh hưởng đến tài liệu chung ở Trang chủ.
            </p>
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
          <div className="space-y-6 max-w-5xl mx-auto">
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
                <div className="border-b border-sage-border pb-4 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <span className="text-[10px] bg-accent/10 px-2.5 py-1 rounded-full text-accent font-semibold tracking-wider font-mono uppercase">
                      BƯỚC 1
                    </span>
                    <h4 className="text-lg font-serif font-bold text-accent mt-1">
                      Sinh chuẩn đầu ra của từng bài học
                    </h4>
                  </div>
                  <span className="text-xs text-ink/60">
                    Sử dụng AI để so chuẩn và sinh CLO từ nội dung bài giảng.
                  </span>
                </div>

                <div className="space-y-4">
                  {session.lessons.map((lesson) => {
                    const lSugs = state?.lesson_suggestions[lesson.id] || [];
                    const lSelected = state?.selected_outcomes[lesson.id] || [];
                    const isGeneratingThis = generatingLessonId === lesson.id;
                    const hasSugs = lSugs.length > 0;

                    return (
                      <div
                        key={lesson.id}
                        className={`p-4 rounded-2xl border transition-all ${
                          hasSugs
                            ? "border-sage-border bg-white"
                            : "border-slate-100 bg-[#FAFBF9]/50"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-50 pb-3 mb-3">
                          <div className="space-y-0.5">
                            <h5 className="font-bold text-ink flex items-center gap-1.5 text-base">
                              <span className="font-serif text-accent">Bài {lesson.lesson_number}:</span>
                              <span>{cleanLessonTitle(lesson.title, lesson.lesson_number)}</span>
                            </h5>
                            {lesson.chapter_title && (
                              <p className="text-xs text-ink/50">
                                Ánh xạ: Ch.{lesson.chapter_number} - {lesson.chapter_title}
                              </p>
                            )}
                          </div>

                          <button
                            onClick={() => handleGenerateLesson(lesson.id)}
                            disabled={generatingLessonId !== null}
                            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all outline-none ${
                              hasSugs
                                ? "bg-sage-light text-accent border border-sage-border hover:bg-sage-hover"
                                : "bg-accent text-white hover:bg-sage-dark shadow-xs"
                            }`}
                          >
                            {isGeneratingThis ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>Đang sinh gợi ý...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>{hasSugs ? "Sinh lại gợi ý" : "Dò & Gợi ý CDR"}</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* OUTCOMES SUGGESTIONS PANEL */}
                        {hasSugs ? (
                          <div className="space-y-4">
                            {lSugs.map((item) => {
                              return (
                                <div
                                  key={item.subitemKey}
                                  className="p-4 rounded-xl border border-sage-border/60 bg-[#FCFBF9] space-y-3"
                                >
                                  {/* Subitem original content header */}
                                  <div className="flex items-start justify-between gap-3 border-b border-sage-border/30 pb-2">
                                    <div>
                                      <span className="text-[10px] font-bold text-accent uppercase tracking-wider font-mono">
                                        {item.category === "knowledge" ? "Kiến thức" : item.category === "skills" ? "Kỹ năng" : "Tự chủ & Trách nhiệm"} ({item.subitemKey})
                                      </span>
                                      <p className="text-xs text-ink/70 italic mt-0.5">
                                        Mục tiêu gốc: {item.originalText}
                                      </p>
                                    </div>
                                  </div>

                                  {/* 3 custom options */}
                                  <div className="space-y-2">
                                    <span className="text-[10px] font-bold text-ink/40 uppercase tracking-widest block">
                                      Phương án đề xuất bám sát Bloom bài học:
                                    </span>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                                      {item.suggestions.map((optionText, idx) => {
                                        const isOptionSelected = item.selectedSuggestion === optionText;
                                        return (
                                          <button
                                            key={idx}
                                            type="button"
                                            onClick={() => {
                                              selectBloomSubitem(lesson.id, item.subitemKey, optionText)
                                                .then((nextState) => setState(nextState))
                                                .catch((err) => setFeedback({ message: `Lỗi lưu lựa chọn: ${err.message}`, type: "error" }));
                                            }}
                                            className={`p-3 text-left rounded-xl border text-xs font-sans transition-all flex flex-col justify-between ${
                                              isOptionSelected
                                                ? "bg-accent/5 border-accent text-accent font-medium ring-1 ring-accent"
                                                : "bg-white border-sage-border/50 text-ink/75 hover:bg-sage-hover"
                                            }`}
                                          >
                                            <span className="leading-relaxed">{optionText}</span>
                                            <span className="text-[8px] opacity-40 mt-1 uppercase font-bold text-right tracking-wider block">
                                              Gợi ý {idx + 1}
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  {/* Inline custom editing of selected option */}
                                  <div className="pt-2 border-t border-sage-border/30 flex items-center gap-2">
                                    <label className="text-[10px] font-bold text-ink/40 uppercase whitespace-nowrap">Hiệu chỉnh:</label>
                                    <input
                                      type="text"
                                      value={item.selectedSuggestion || ""}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        const updated = { ...item, selectedSuggestion: val };
                                        const list = state?.lesson_suggestions[lesson.id] || [];
                                        const updatedList = list.map(it => it.subitemKey === item.subitemKey ? updated : it);
                                        if (state) {
                                          setState({
                                            ...state,
                                            lesson_suggestions: {
                                              ...state.lesson_suggestions,
                                              [lesson.id]: updatedList
                                            }
                                          });
                                        }
                                      }}
                                      onBlur={() => {
                                        selectBloomSubitem(lesson.id, item.subitemKey, item.selectedSuggestion || "")
                                          .then((nextState) => setState(nextState))
                                          .catch(() => {});
                                      }}
                                      className="flex-1 px-3 py-1.5 text-xs border border-sage-border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-accent"
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-[11px] text-ink/40 italic flex items-center gap-1.5">
                            <HelpCircle className="w-3.5 h-3.5" />
                            <span>Chưa sinh gợi ý cho bài giảng này. Vui lòng bấm "Dò & Gợi ý CDR" để kích hoạt AI.</span>
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
                            
                            <div className="space-y-4">
                              {grpItems.map((item) => (
                                <div
                                  key={item.subitemKey}
                                  className="p-4 rounded-xl border border-sage-border/60 bg-[#FCFBF9] space-y-3"
                                >
                                  {/* Subitem original content header */}
                                  <div className="flex items-start justify-between gap-3 border-b border-sage-border/30 pb-2">
                                    <div>
                                      <span className="text-xs font-bold text-accent uppercase tracking-wider font-semibold">
                                        Tiểu mục chuẩn đầu ra CLO {item.subitemKey}
                                      </span>
                                      {item.originalText && (
                                        <p className="text-xs text-ink/70 italic mt-0.5">
                                          Nội dung gốc: {item.originalText}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  {/* 3 suggestions */}
                                  <div className="space-y-2">
                                    <span className="text-[10px] font-bold text-ink/40 uppercase tracking-widest block">
                                      Phương án đề xuất bám sát Bloom chung:
                                    </span>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                                      {item.suggestions.map((optionText, idx) => {
                                        const isOptionSelected = item.selectedSuggestion === optionText;
                                        return (
                                          <button
                                            key={idx}
                                            type="button"
                                            onClick={() => {
                                              selectBloomCourseSubitem(item.subitemKey, optionText)
                                                .then((nextState) => setState(nextState))
                                                .catch((err) => setFeedback({ message: `Lỗi lưu lựa chọn CLO: ${err.message}`, type: "error" }));
                                            }}
                                            className={`p-3.5 text-left rounded-xl border text-sm font-sans transition-all flex flex-col justify-between cursor-pointer ${
                                              isOptionSelected
                                                ? "bg-accent/5 border-accent text-accent font-medium ring-1 ring-accent"
                                                : "bg-white border-sage-border/50 text-ink/75 hover:bg-sage-hover"
                                            }`}
                                          >
                                            <span className="leading-relaxed">{optionText}</span>
                                            <span className="text-[9px] opacity-40 mt-2 uppercase font-bold text-right tracking-wider block">
                                              Gợi ý {idx + 1}
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  {/* Fine-tune editing */}
                                  <div className="pt-2 border-t border-sage-border/30 flex items-center gap-2">
                                    <label className="text-xs font-bold text-ink/50 uppercase whitespace-nowrap">Hiệu chỉnh:</label>
                                    <input
                                      type="text"
                                      value={item.selectedSuggestion || ""}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        const updated = { ...item, selectedSuggestion: val };
                                        const updatedList = state.course_suggestions.map(it => it.subitemKey === item.subitemKey ? updated : it);
                                        setState({
                                          ...state,
                                          course_suggestions: updatedList
                                        });
                                      }}
                                      onBlur={() => {
                                        selectBloomCourseSubitem(item.subitemKey, item.selectedSuggestion || "")
                                          .then((nextState) => setState(nextState))
                                          .catch(() => {});
                                      }}
                                      className="flex-1 px-3.5 py-2 text-sm border border-sage-border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-accent"
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}
