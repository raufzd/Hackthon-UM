"use client";

import * as XLSX from "xlsx";
import { UploadCloud } from "lucide-react";

import { useTranslation } from "@/hooks/useTranslation";

type UploadPayload = {
  fileName: string;
  text: string;
};

type UploadZoneProps = {
  onFilesRead: (files: UploadPayload[]) => Promise<void>;
  isUploading: boolean;
};

function tryExtractTextFromPdf(rawText: string) {
  const parenthesized = [...rawText.matchAll(/\(([^)]{3,})\)/g)]
    .map((item) => item[1].replace(/\\[rn]/g, " ").trim())
    .filter(Boolean);
  const readableRuns =
    rawText
      .match(/[A-Za-z][A-Za-z0-9,;:()/%\- ]{2,80}/g)
      ?.map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length >= 3) ?? [];
  return [...parenthesized, ...readableRuns].join(" ").replace(/\s+/g, " ").trim();
}

async function readFileText(file: File) {
  const extension = file.name.toLowerCase().split(".").pop();

  if (extension === "txt" || file.type === "text/plain") {
    return file.text();
  }

  if (extension === "xlsx" || extension === "xls" || extension === "csv" || file.type.includes("spreadsheet")) {
    const bytes = await file.arrayBuffer();
    const workbook = XLSX.read(bytes, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return "";
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
      header: 1,
      raw: false,
      blankrows: false,
    });
    return rows
      .flat()
      .map((item) => (item ?? "").toString().trim())
      .filter(Boolean)
      .join(", ");
  }

  const bytes = await file.arrayBuffer();
  const decoded = new TextDecoder("latin1").decode(bytes);
  return tryExtractTextFromPdf(decoded);
}

export function UploadZone({ onFilesRead, isUploading }: UploadZoneProps) {
  const { t } = useTranslation();

  async function processFiles(fileList: FileList | null) {
    if (!fileList) return;
    const payload: UploadPayload[] = [];
    for (const file of Array.from(fileList)) {
      const text = await readFileText(file);
      if (!text.trim()) continue;
      payload.push({ fileName: file.name, text });
    }
    if (payload.length > 0) {
      await onFilesRead(payload);
    }
  }

  return (
    <label
      className="block cursor-pointer rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center transition hover:border-primary hover:bg-emerald-50"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void processFiles(e.dataTransfer.files);
      }}
    >
      <UploadCloud className="mx-auto mb-3 h-8 w-8 text-primary" />
      <p className="text-sm font-semibold">{t("dropTitle")}</p>
      <p className="mb-2 text-xs text-slate-500">{t("dropHint")}</p>
      <p className="text-xs text-slate-400">PDF / TXT / XLSX / CSV</p>
      {isUploading ? <p className="mt-2 text-xs text-slate-500">Processing...</p> : null}
      <input
        type="file"
        className="hidden"
        multiple
        accept=".pdf,.txt,.xlsx,.xls,.csv,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
        onChange={(e) => void processFiles(e.target.files)}
      />
    </label>
  );
}
