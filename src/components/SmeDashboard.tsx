"use client";

import { useEffect, useMemo, useState } from "react";

import { classifyDocumentAction, verifyIngredientsAction } from "@/app/actions/ai-actions";
import { IngredientList } from "@/components/IngredientList";
import { Sidebar } from "@/components/Sidebar";
import { UploadZone } from "@/components/UploadZone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import type { AuthUser, SmeSection } from "@/types/app";
import type { DocumentType, IngredientVerification, UploadedDocument } from "@/types/halal";

const REQUIRED_DOCS: DocumentType[] = ["company-registration", "premises-license", "ingredient-list"];

function isIngredientDocument(fileName: string, text: string) {
  const source = `${fileName} ${text}`.toLowerCase();
  return (
    source.includes("ingredient") ||
    source.includes("ramuan") ||
    source.includes("senarai bahan") ||
    fileName.toLowerCase().endsWith(".xlsx") ||
    fileName.toLowerCase().endsWith(".xls") ||
    fileName.toLowerCase().endsWith(".csv")
  );
}

type SmeDashboardProps = {
  user: AuthUser;
  onLogout: () => void;
};

const SME_STORAGE_KEY = "halalchain_sme_state";

export function SmeDashboard({ user, onLogout }: SmeDashboardProps) {
  const { t, lang, setLang } = useTranslation();
  const [section, setSection] = useState<SmeSection>("upload");
  const [isUploading, setIsUploading] = useState(false);
  const [documents, setDocuments] = useState<UploadedDocument[]>(() => {
    if (typeof window === "undefined") return [];
    const raw = localStorage.getItem(SME_STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as { documents: UploadedDocument[]; ingredients: IngredientVerification[] };
      return parsed.documents ?? [];
    } catch {
      localStorage.removeItem(SME_STORAGE_KEY);
      return [];
    }
  });
  const [ingredients, setIngredients] = useState<IngredientVerification[]>(() => {
    if (typeof window === "undefined") return [];
    const raw = localStorage.getItem(SME_STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as { documents: UploadedDocument[]; ingredients: IngredientVerification[] };
      return parsed.ingredients ?? [];
    } catch {
      localStorage.removeItem(SME_STORAGE_KEY);
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(SME_STORAGE_KEY, JSON.stringify({ documents, ingredients }));
  }, [documents, ingredients]);

  const found = useMemo(() => new Set(documents.map((doc) => doc.documentType)), [documents]);
  const completedCount = REQUIRED_DOCS.filter((item) => found.has(item)).length;
  const hasHaram = ingredients.some((item) => item.status === "Haram");
  const hasOpenAmbiguous = ingredients.some((item) => item.status === "Ambiguous" && !item.isOverridden);
  const canExport = completedCount === REQUIRED_DOCS.length && !hasHaram && !hasOpenAmbiguous;

  async function onFilesRead(files: { fileName: string; text: string }[]) {
    setIsUploading(true);
    try {
      for (const file of files) {
        const classified = await classifyDocumentAction({ text: file.text, fileName: file.fileName });
        const documentId = crypto.randomUUID();
        const nextDoc: UploadedDocument = {
          id: documentId,
          name: file.fileName,
          documentType: classified.documentType as DocumentType,
          confidence: classified.confidence,
          text: file.text.slice(0, 4000),
          uploadedAt: new Date().toISOString(),
        };
        setDocuments((prev) => [nextDoc, ...prev]);

        if (isIngredientDocument(file.fileName, file.text)) {
          const result = await verifyIngredientsAction({ text: file.text });
          const mapped: IngredientVerification[] = result.ingredients.map((ingredient) => ({
            id: crypto.randomUUID(),
            ingredientName: ingredient.ingredientName,
            normalizedName: ingredient.normalizedName,
            status: ingredient.status,
            confidence: ingredient.confidence,
            reasoning: ingredient.reasoning,
            sourceDocumentId: documentId,
            sourceDocumentName: file.fileName,
          }));
          setIngredients((prev) => [...mapped, ...prev]);
        }
      }
    } finally {
      setIsUploading(false);
    }
  }

  function exportData(format: "json" | "pdf") {
    const payload = {
      generatedAt: new Date().toISOString(),
      user,
      documents,
      ingredients,
    };
    const fileName = format === "json" ? "HalalChain_Export.json" : "HalalChain_AuditBundle.pdf.txt";
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white">H</div>
            <div>
              <p className="font-semibold text-primary">{t("appTitle")}</p>
              <p className="text-xs text-slate-500">{t("smePortal")}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 text-xs">
              <button className={`rounded-full px-2 py-1 ${lang === "en" ? "bg-primary text-white" : ""}`} onClick={() => setLang("en")}>EN</button>
              <button className={`rounded-full px-2 py-1 ${lang === "ms" ? "bg-primary text-white" : ""}`} onClick={() => setLang("ms")}>BM</button>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-slate-500">{user.regNo}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={onLogout}>
              {t("logout")}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 p-6 lg:grid-cols-[280px_1fr]">
        <Sidebar
          items={[
            { id: "upload", label: t("navUpload") },
            { id: "ingredients", label: t("navIngredients") },
            { id: "export", label: t("navExport") },
          ]}
          active={section}
          onSelect={(id) => setSection(id as SmeSection)}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Workflow Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">
                {ingredients.length > 0 ? t("workflowReview") : t("workflowAwaiting")}
              </p>
              <p>{completedCount}/3 {t("docsUploaded")}</p>
            </CardContent>
          </Card>
        </Sidebar>

        <main className="space-y-6">
          {section === "upload" ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("step1Title")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="mb-2 font-medium">{t("requiredDocs")}</p>
                  <ul className="space-y-2 text-sm">
                    <li>• Company Registration {found.has("company-registration") ? "✓" : "⏳"}</li>
                    <li>• Premises License {found.has("premises-license") ? "✓" : "⏳"}</li>
                    <li>• Ingredient List {found.has("ingredient-list") ? "✓" : "⏳"}</li>
                  </ul>
                </div>
                <UploadZone onFilesRead={onFilesRead} isUploading={isUploading} />
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div key={doc.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                      <p className="font-medium">{doc.name}</p>
                      <p className="text-xs text-slate-500">{doc.documentType} • {doc.confidence}%</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {section === "ingredients" ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("step2Title")}</CardTitle>
              </CardHeader>
              <CardContent>
                <IngredientList
                  ingredients={ingredients}
                  onUpdateIngredient={(id, next) =>
                    setIngredients((prev) => prev.map((item) => (item.id === id ? { ...item, ...next } : item)))
                  }
                />
                <div className="mt-4">
                  <Button onClick={() => setSection("export")} disabled={!canExport}>
                    {t("proceedExport")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {section === "export" ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("step3Title")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button onClick={() => exportData("json")} disabled={!canExport}>
                  {t("exportJSON")}
                </Button>
                <Button variant="secondary" onClick={() => exportData("pdf")} disabled={!canExport}>
                  {t("exportPDF")}
                </Button>
                {!canExport ? (
                  <p className="text-sm text-amber-700">Resolve missing documents and ingredient flags before export.</p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </main>
      </div>
    </div>
  );
}
