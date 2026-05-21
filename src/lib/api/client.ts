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
