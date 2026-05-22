import { useEffect, useState, useTransition } from "react";

import { Layout } from "../components/layout";
import { LessonList } from "../components/lessons/lesson-list";
import { ProviderStatusBadge } from "../components/system/provider-status-badge";
import { UploadWizard } from "../components/upload/upload-wizard";
import {
  cancelExtraction,
  fetchCLIProxyHealth,
  fetchHealthStatus,
  fetchUploadSession,
  startExtraction,
  triggerCLIProxyLogin,
  type LoginProvider,
  uploadCdr,
  uploadGt
} from "../lib/api/client";
import type { UploadSessionSummary } from "../lib/schemas/lesson";

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

const LOGIN_OPTIONS: Array<{ label: string; provider: LoginProvider }> = [
  { label: "Antigravity", provider: "antigravity" },
  { label: "Gemini", provider: "gemini" },
  { label: "OpenAI", provider: "openai" },
  { label: "Qwen", provider: "qwen" },
  { label: "Kimi", provider: "kimi" }
];

export function UploadPage() {
  const [backendStatus, setBackendStatus] = useState<"ready" | "offline">("offline");
  const [providerStatus, setProviderStatus] = useState<"ready" | "offline">("offline");
  const [session, setSession] = useState<UploadSessionSummary>(EMPTY_SESSION);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [isUploadingCdr, startUploadingCdr] = useTransition();
  const [isUploadingGt, startUploadingGt] = useTransition();
  const [isExtracting, startExtracting] = useTransition();
  const [isLaunchingLogin, startLaunchingLogin] = useTransition();
  const [isLoginMenuOpen, setIsLoginMenuOpen] = useState(false);
  const isSessionPollingActive =
    session.cdr_status === "preparing" || session.gt_status === "preparing" || session.processing;

  function refreshStatuses() {
    fetchHealthStatus()
      .then((response) => {
        setBackendStatus(response.success ? "ready" : "offline");
      })
      .catch(() => {
        setBackendStatus("offline");
      });

    fetchCLIProxyHealth()
      .then((response) => {
        setProviderStatus(response.success ? "ready" : "offline");
      })
      .catch(() => {
        setProviderStatus("offline");
      });
  }

  function refreshSession() {
    fetchUploadSession()
      .then((nextSession) => {
        setSession(nextSession);
      })
      .catch(() => {
        setSession(EMPTY_SESSION);
      });
  }

  useEffect(() => {
    refreshStatuses();
    refreshSession();
  }, []);

  useEffect(() => {
    if (!isSessionPollingActive) {
      return;
    }

    const timer = window.setInterval(() => {
      refreshSession();
      refreshStatuses();
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isSessionPollingActive, session.session_id]);

  useEffect(() => {
    if (session.cdr_status === "failed" && session.cdr_error) {
      setFeedbackMessage(session.cdr_error);
      return;
    }
    if (session.gt_status === "failed" && session.gt_error) {
      setFeedbackMessage(session.gt_error);
    }
  }, [session.cdr_status, session.cdr_error, session.gt_status, session.gt_error]);

  async function handleUploadCdr(file: File) {
    startUploadingCdr(() => {
      uploadCdr(file)
        .then((nextSession) => {
          setSession(nextSession);
          setFeedbackMessage("Đã nhận file CDR và bắt đầu xử lý nền.");
        })
        .catch((error: Error) => {
          setFeedbackMessage(`Upload file CDR thất bại: ${error.message}`);
        });
    });
  }

  async function handleUploadGt(file: File) {
    startUploadingGt(() => {
      uploadGt(file)
        .then((nextSession) => {
          setSession(nextSession);
          setFeedbackMessage("Đã nhận file giáo trình và bắt đầu xử lý nền.");
        })
        .catch((error: Error) => {
          setFeedbackMessage(`Upload file giáo trình thất bại: ${error.message}`);
        });
    });
  }

  async function handleExtract() {
    startExtracting(() => {
      startExtraction()
        .then((nextSession) => {
          setSession(nextSession);
          setFeedbackMessage("Đã bắt đầu trích xuất và ghép nội dung cho từng bài.");
        })
        .catch((error: Error) => {
          setFeedbackMessage(`Không thể trích xuất: ${error.message}`);
        });
    });
  }

  async function handleCancelExtract() {
    cancelExtraction()
      .then((nextSession) => {
        setSession(nextSession);
        setFeedbackMessage("Đã dừng quá trình trích xuất.");
      })
      .catch((error: Error) => {
        setFeedbackMessage(`Không thể dừng: ${error.message}`);
      });
  }

  function handleCLIProxyLogin(provider: LoginProvider) {
    setIsLoginMenuOpen(false);
    startLaunchingLogin(() => {
      triggerCLIProxyLogin(provider)
        .then((result) => {
          if (result.auth_url) {
            window.open(result.auth_url, "_blank", "noopener,noreferrer");
          }
          setFeedbackMessage(result.message);

          window.setTimeout(() => {
            refreshStatuses();
          }, 1500);
        })
        .catch((error: Error) => {
          setFeedbackMessage(`Không mở được đăng nhập provider: ${error.message}`);
        });
    });
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Welcome Banner matching design dashboard mood */}
        <div className="bg-[#4B5E40] rounded-[32px] p-8 md:p-10 text-white relative overflow-hidden flex flex-col justify-between shadow-xl min-h-[220px]">
          <div className="relative z-10 w-full">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
              <h3 className="text-2xl md:text-3xl font-serif mt-2 leading-snug">Chuẩn hóa cấu trúc khung bài giảng kỹ thuật số</h3>
              <div className="flex items-center gap-3 bg-white/10 px-4 py-2 rounded-2xl border border-white/10 backdrop-blur-xs flex-shrink-0 self-start sm:self-auto">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                  <span className={`w-2 h-2 rounded-full ${backendStatus === "ready" ? "bg-[#A3E635]" : "bg-red-400 animate-pulse"}`}></span>
                  <span>Hệ thống</span>
                </div>
                <div className="w-px h-3.5 bg-white/20"></div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                  <span className={`w-2 h-2 rounded-full ${providerStatus === "ready" ? "bg-[#A3E635]" : "bg-red-400 animate-pulse"}`}></span>
                  <span>Cổng AI</span>
                </div>
              </div>
            </div>
            <p className="mt-3 text-[#C5D1C0] text-xs md:text-sm w-full leading-relaxed">
              Tải lên các tài liệu CDR (Chuẩn đầu ra) để tự động ánh xạ cấu trúc chương, phân tích các điểm neo kiến thức và sinh câu trả lời thông minh dựa trên tư liệu giáo trình chuẩn hóa.
            </p>
          </div>
          {/* Decorative shapes */}
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-[#6A7E5F] rounded-full opacity-40"></div>
          <div className="absolute right-10 bottom-10 w-32 h-32 bg-white/5 rounded-full"></div>
        </div>

        <UploadWizard
          session={session}
          onUploadCdr={handleUploadCdr}
          onUploadGt={handleUploadGt}
          isUploadingCdr={isUploadingCdr}
          isUploadingGt={isUploadingGt}
          feedbackMessage={feedbackMessage}
        />

        <LessonList
          canExtract={session.can_extract}
          isExtracting={isExtracting || session.processing}
          lessons={session.lessons}
          onExtract={() => void handleExtract()}
          onCancel={() => void handleCancelExtract()}
        />
      </div>
    </Layout>
  );
}
