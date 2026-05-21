export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export type LessonStatus =
  | "uploaded"
  | "preparing_gt"
  | "ready"
  | "processing"
  | "completed"
  | "failed";

export type CDRStatus = "missing" | "preparing" | "ready" | "failed";
export type GTStatus = "missing" | "preparing" | "ready" | "failed";

export interface LessonSummary {
  id: string;
  lesson_number: number;
  title: string;
  chapter_number?: number | null;
  chapter_title?: string | null;
  status: LessonStatus;
  error?: string | null;
  preview_ready: boolean;
}

export interface UploadSessionSummary {
  session_id: string;
  cdr_file_name?: string | null;
  gt_file_name?: string | null;
  cdr_status: CDRStatus;
  gt_status: GTStatus;
  cdr_error?: string | null;
  gt_error?: string | null;
  processing: boolean;
  can_extract: boolean;
  lessons: LessonSummary[];
}

export interface UploadResult {
  session: UploadSessionSummary;
}

export interface PreviewBlock {
  id: string;
  kind: "paragraph" | "table" | "inserted_paragraph";
  source: "cdr" | "gt" | "generated";
  textPreview: string;
  orderIndex: number;
  tableRows?: string[][];
}

export interface AnchorPreview {
  id: string;
  kind: "content_duration" | "section_duration" | "method" | "question_answer";
  label: string;
}

export interface LessonPreviewModel {
  lessonId: string;
  lessonTitle: string;
  partOneBlocks: PreviewBlock[];
  partTwoBlocks: PreviewBlock[];
  documentBlocks: PreviewBlock[];
  anchors: AnchorPreview[];
  generatedBlocks: PreviewBlock[];
}

export interface CLIProxyLoginResult {
  launched: boolean;
  provider: string;
  message: string;
  mode?: string | null;
  auth_url?: string | null;
  auth_code?: string | null;
}
