import * as fs from "fs";
import * as path from "path";

export function normalizeInputDocument(sourcePath: string, destinationDir: string): string {
  if (!fs.existsSync(destinationDir)) {
    fs.mkdirSync(destinationDir, { recursive: true });
  }

  const ext = path.extname(sourcePath).toLowerCase();
  if (ext !== ".docx") {
    throw new Error(`Unsupported file format ${ext}. Vui lòng sử dụng tài liệu .docx`);
  }

  const destPath = path.join(destinationDir, path.basename(sourcePath));
  if (path.resolve(sourcePath) !== path.resolve(destPath)) {
    fs.copyFileSync(sourcePath, destPath);
  }
  return destPath;
}
