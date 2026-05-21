import type { ReactNode } from "react";
import { createBrowserRouter } from "react-router-dom";
import { AppProviders } from "./providers";
import { LessonDetailPage } from "../pages/lesson-detail-page";
import { UploadPage } from "../pages/upload-page";

function withProviders(element: ReactNode) {
  return <AppProviders>{element}</AppProviders>;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: withProviders(<UploadPage />)
  },
  {
    path: "/lessons/:lessonId",
    element: withProviders(<LessonDetailPage />)
  }
]);
