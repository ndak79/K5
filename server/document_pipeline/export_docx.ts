import AdmZip from "adm-zip";
import * as fs from "fs";
import * as path from "path";
import { LessonDocumentModel, GeneratedInsertion } from "../services/normalizer";
import { composeDocumentBlocks } from "../services/document_composer";

const W_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function wrapDocumentXml(blockXmlSegments: string[]): string {
  const bodyXml = blockXmlSegments.join("\n");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W_NAMESPACE}">
  <w:body>
    ${bodyXml}
    <w:sectPr />
  </w:body>
</w:document>`;
}

function buildExportBlockXml(lesson: LessonDocumentModel, insertions: GeneratedInsertion[]): string[] {
  return composeDocumentBlocks(lesson, insertions)
    .map((block) => block.xml)
    .filter((xml): xml is string => !!xml);
}

export function exportLessonDocument(
  lesson: LessonDocumentModel,
  insertions: GeneratedInsertion[],
  outputPath: string
): string {
  const parentDir = path.dirname(outputPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  const documentXml = wrapDocumentXml(buildExportBlockXml(lesson, insertions));

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const zip = new AdmZip();
  zip.addFile("[Content_Types].xml", Buffer.from(contentTypesXml, "utf-8"));
  zip.addFile("_rels/.rels", Buffer.from(relsXml, "utf-8"));
  zip.addFile("word/document.xml", Buffer.from(documentXml, "utf-8"));

  zip.writeZip(outputPath);
  return outputPath;
}
