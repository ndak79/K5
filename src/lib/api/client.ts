import type {
  ApiResponse,
  CLIProxyLoginResult,
  LessonPreviewModel,
  UploadResult
} from "../schemas/lesson";

const API_BASE_URL = "";

export type LoginProvider =
  | "antigravity"
  | "gemini"
  | "openai"
  | "qwen"
  | "kimi";

async function parseJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      payload &&
      typeof payload === "object" &&
      "detail" in payload &&
      typeof payload.detail === "string"
        ? payload.detail
        : payload &&
            typeof payload === "object" &&
            "error" in payload &&
            typeof payload.error === "string"
          ? payload.error
          : `HTTP ${response.status}`;
    throw new Error(detail);
  }

  return payload as T;
}

function createFileFormData(fieldName: string, file: File) {
  const formData = new FormData();
  formData.append(fieldName, file);
  return formData;
}

export async function fetchHealthStatus() {
  return parseJson<ApiResponse<{ status: string }>>(
    await fetch(`${API_BASE_URL}/api/system/health`, {
      cache: "no-store"
    })
  );
}

export async function fetchCLIProxyHealth() {
  return parseJson<ApiResponse<{ status: string; models: string[] }>>(
    await fetch(`${API_BASE_URL}/api/system/cliproxy/health`, {
      cache: "no-store"
    })
  );
}

export async function triggerCLIProxyLogin(provider: LoginProvider) {
  const url = new URL(`${API_BASE_URL}/api/system/cliproxy/login`);
  url.searchParams.set("provider", provider);
  return parseJson<CLIProxyLoginResult>(
    await fetch(url, {
      method: "POST"
    })
  );
}

export async function fetchUploadSession() {
  const payload = await parseJson<UploadResult>(
    await fetch(`${API_BASE_URL}/api/session`, {
      cache: "no-store"
    })
  );
  return payload.session;
}

export async function uploadCdr(file: File) {
  const payload = await parseJson<UploadResult>(
    await fetch(`${API_BASE_URL}/api/upload/cdr`, {
      method: "POST",
      body: createFileFormData("cdr_file", file)
    })
  );
  return payload.session;
}

export async function uploadGt(file: File) {
  const payload = await parseJson<UploadResult>(
    await fetch(`${API_BASE_URL}/api/upload/gt`, {
      method: "POST",
      body: createFileFormData("gt_file", file)
    })
  );
  return payload.session;
}

export async function startExtraction() {
  const payload = await parseJson<UploadResult>(
    await fetch(`${API_BASE_URL}/api/extract`, {
      method: "POST"
    })
  );
  return payload.session;
}

export async function cancelExtraction() {
  const payload = await parseJson<UploadResult>(
    await fetch(`${API_BASE_URL}/api/extract/cancel`, {
      method: "POST"
    })
  );
  return payload.session;
}

export async function retryLessonQuestions(lessonId: string) {
  const payload = await parseJson<ApiResponse<UploadResult["session"]>>(
    await fetch(`${API_BASE_URL}/api/lessons/${lessonId}/retry`, {
      method: "POST"
    })
  );
  return payload.data;
}

export async function fetchLessonPreview(lessonId: string) {
  return parseJson<ApiResponse<LessonPreviewModel>>(
    await fetch(`${API_BASE_URL}/api/lessons/${lessonId}/preview`, {
      cache: "no-store"
    })
  );
}

export async function exportLesson(lessonId: string) {
  const response = await fetch(`${API_BASE_URL}/api/lessons/${lessonId}/export`, {
    method: "POST"
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.blob();
}

// --- BLOOM CDR OPTIMIZATION FRONTEND INTERFACE ---

export interface BloomSuggestionItem {
  subitemKey: string;
  originalText: string;
  category: "knowledge" | "skills" | "autonomy";
  blockId: string;
  suggestions: string[];
  selectedSuggestion: string | null;
}

export interface BloomState {
  verbs: string[];
  lesson_suggestions: Record<string, BloomSuggestionItem[]>;
  selected_outcomes: Record<string, string[]>;
  course_suggestions: BloomSuggestionItem[];
  selected_course_outcomes: string[];
  status: "idle" | "generating" | "synthesizing" | "ready" | "failed";
  error: string | null;
}

export async function fetchBloomSession(): Promise<any> {
  const payload = await parseJson<{ success: boolean; session: any }>(
    await fetch(`${API_BASE_URL}/api/bloom/session`)
  );
  return payload.session;
}

export async function uploadBloomCdr(file: File): Promise<any> {
  const formData = new FormData();
  formData.append("cdr_file", file);
  const response = await fetch(`${API_BASE_URL}/api/bloom/upload/cdr`, {
    method: "POST",
    body: formData
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Lỗi tải file CDR: HTTP ${response.status}`);
  }
  const payload = await response.json();
  return payload.session;
}

export async function uploadBloomGt(file: File): Promise<any> {
  const formData = new FormData();
  formData.append("gt_file", file);
  const response = await fetch(`${API_BASE_URL}/api/bloom/upload/gt`, {
    method: "POST",
    body: formData
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Lỗi tải file Giáo trình: HTTP ${response.status}`);
  }
  const payload = await response.json();
  return payload.session;
}

export async function fetchBloomState(): Promise<BloomState> {
  const payload = await parseJson<{ success: boolean; data: BloomState }>(
    await fetch(`${API_BASE_URL}/api/bloom/state`)
  );
  return payload.data;
}

export async function updateBloomVerbs(verbs: string[]): Promise<BloomState> {
  const payload = await parseJson<{ success: boolean; data: BloomState }>(
    await fetch(`${API_BASE_URL}/api/bloom/verbs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verbs })
    })
  );
  return payload.data;
}

export async function generateLessonSuggestions(lessonId: string): Promise<{ suggestions: string[]; state: BloomState }> {
  const payload = await parseJson<{ success: boolean; suggestions: string[]; state: BloomState }>(
    await fetch(`${API_BASE_URL}/api/bloom/lessons/${lessonId}/suggest`, {
      method: "POST"
    })
  );
  return payload;
}

export async function generateBulkLessonsSuggestions(lessonIds: string[]): Promise<{ suggestions: Record<string, any>; state: BloomState }> {
  const payload = await parseJson<{ success: boolean; suggestions: Record<string, any>; state: BloomState }>(
    await fetch(`${API_BASE_URL}/api/bloom/lessons/suggest-bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonIds })
    })
  );
  return payload;
}

export async function selectLessonOutcomes(lessonId: string, outcomes: string[]): Promise<BloomState> {
  const payload = await parseJson<{ success: boolean; data: BloomState }>(
    await fetch(`${API_BASE_URL}/api/bloom/lessons/${lessonId}/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcomes })
    })
  );
  return payload.data;
}

export async function selectBloomSubitem(lessonId: string, subitemKey: string, selectedText: string): Promise<BloomState> {
  const payload = await parseJson<{ success: boolean; data: BloomState }>(
    await fetch(`${API_BASE_URL}/api/bloom/lessons/${lessonId}/select-subitem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subitemKey, selectedText })
    })
  );
  return payload.data;
}

export async function generateCourseSuggestions(): Promise<{ suggestions: BloomSuggestionItem[]; state: BloomState }> {
  const payload = await parseJson<{ success: boolean; suggestions: BloomSuggestionItem[]; state: BloomState }>(
    await fetch(`${API_BASE_URL}/api/bloom/course/suggest`, {
      method: "POST"
    })
  );
  return payload;
}

export async function selectBloomCourseSubitem(subitemKey: string, selectedText: string): Promise<BloomState> {
  const payload = await parseJson<{ success: boolean; data: BloomState }>(
    await fetch(`${API_BASE_URL}/api/bloom/course/select-subitem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subitemKey, selectedText })
    })
  );
  return payload.data;
}

export async function selectCourseOutcomes(outcomes: string[]): Promise<BloomState> {
  const payload = await parseJson<{ success: boolean; data: BloomState }>(
    await fetch(`${API_BASE_URL}/api/bloom/course/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcomes })
    })
  );
  return payload.data;
}

export async function resetBloomState(): Promise<BloomState> {
  const payload = await parseJson<{ success: boolean; data: BloomState }>(
    await fetch(`${API_BASE_URL}/api/bloom/reset`, {
      method: "POST"
    })
  );
  return payload.data;
}

export async function exportBloomCdrBlob(): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/bloom/export`, {
    method: "POST"
  });
  if (!response.ok) {
    throw new Error(`Xử lý xuất Bloom CDR lỗi: HTTP ${response.status}`);
  }
  return response.blob();
}

