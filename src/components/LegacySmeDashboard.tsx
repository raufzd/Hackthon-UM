"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileText, UploadCloud } from "lucide-react";
import * as XLSX from "xlsx";

import {
  classifyDocumentAction,
  suggestHalalAlternativesAction,
  verifyIngredientsAction,
} from "@/app/actions/ai-actions";
import { AIChatbox } from "@/components/AIChatbox";
import {
  createSupplierRequest,
  getSupplierRequests,
  subscribeSupplierRequests,
} from "@/lib/mockDatabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { DocumentType, IngredientStatus, IngredientVerification, UploadedDocument } from "@/types/halal";

const STORAGE_KEY = "halalchain-mvp-state";
const REQUIRED_DOCUMENTS: DocumentType[] = [
  "company-registration",
  "premises-license",
  "ingredient-list",
  "process-flow",
];

const DOCUMENT_LABELS: Record<DocumentType, string> = {
  "company-registration": "Company Registration",
  "premises-license": "Premises License",
  "ingredient-list": "Ingredient List",
  "process-flow": "Process Flow",
};

function isIngredientDocument(fileName: string, text: string) {
  const source = `${fileName} ${text}`.toLowerCase();
  const hasLicensingSignals =
    source.includes("pelesenan") ||
    source.includes("jabatan pelesenan") ||
    source.includes("premis") ||
    source.includes("premises") ||
    source.includes("lesen") ||
    source.includes("license");

  if (hasLicensingSignals) return false;

  const extension = fileName.toLowerCase().split(".").pop();
  const isSpreadsheet = extension === "xlsx" || extension === "xls" || extension === "csv";

  return (
    isSpreadsheet ||
    source.includes("ingredient") ||
    source.includes("ingredients") ||
    source.includes("ingredient list") ||
    source.includes("dataset") ||
    source.includes("senarai bahan") ||
    source.includes("ramuan")
  );
}

type PersistedState = {
  documents: UploadedDocument[];
  ingredients: IngredientVerification[];
};

function statusBadge(status: IngredientStatus) {
  if (status === "Halal") return "success";
  if (status === "Haram") return "danger";
  return "warning";
}

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

  if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
    return file.text();
  }

  if (extension === "xlsx" || extension === "xls" || extension === "csv" || file.type.includes("spreadsheet")) {
    const bytes = await file.arrayBuffer();
    const workbook = XLSX.read(bytes, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) return "";

    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(worksheet, {
      header: 1,
      raw: false,
      blankrows: false,
    });

    return rows
      .flat()
      .map((cell) => (cell ?? "").toString().trim())
      .filter((cell) => cell.length > 0)
      .join(", ");
  }

  const bytes = await file.arrayBuffer();
  const decoded = new TextDecoder("latin1").decode(bytes);
  return tryExtractTextFromPdf(decoded);
}

type LegacySmeDashboardProps = {
  onLogout: () => void;
  smeName: string;
};

export function LegacySmeDashboard({ onLogout, smeName }: LegacySmeDashboardProps) {
  const [documents, setDocuments] = useState<UploadedDocument[]>(() => {
    if (typeof window === "undefined") return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as PersistedState;
      return parsed.documents ?? [];
    } catch {
      return [];
    }
  });
  const [ingredients, setIngredients] = useState<IngredientVerification[]>(() => {
    if (typeof window === "undefined") return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as PersistedState;
      return parsed.ingredients ?? [];
    } catch {
      return [];
    }
  });
  const [isUploading, setIsUploading] = useState(false);
  const [activeIngredient, setActiveIngredient] = useState<IngredientVerification | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<IngredientStatus>("Halal");
  const [requestMessage, setRequestMessage] = useState("");
  const [haramAlternatives, setHaramAlternatives] = useState<
    Record<string, Array<{ name: string; reason: string }>>
  >({});
  const loadingAlternativesRef = useRef<Set<string>>(new Set());
  const [activeReplacementIngredient, setActiveReplacementIngredient] = useState<IngredientVerification | null>(null);
  const [selectedAlternative, setSelectedAlternative] = useState("");

  useEffect(() => {
    const data: PersistedState = { documents, ingredients };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [documents, ingredients]);

  useEffect(() => {
    const applyResolvedRequests = () => {
      const requests = getSupplierRequests().filter((item) => item.status === "resolved" && item.resolutionStatus);
      if (requests.length === 0) return;

      setIngredients((prev) =>
        prev.map((ingredient) => {
          const match = requests.find(
            (request) => request.ingredientName.toLowerCase() === ingredient.ingredientName.toLowerCase()
          );
          if (!match || !match.resolutionStatus) return ingredient;

          const mappedStatus: IngredientStatus =
            match.resolutionStatus === "Unknown" ? "Ambiguous" : match.resolutionStatus;

          return {
            ...ingredient,
            status: mappedStatus,
            supplierCertificateUploaded: true,
            confidence: Math.max(ingredient.confidence, 95),
            reasoning: `${ingredient.reasoning} Verified by supplier resolution.`,
          };
        })
      );
    };

    applyResolvedRequests();
    return subscribeSupplierRequests(applyResolvedRequests);
  }, []);

  const foundDocumentTypes = useMemo(() => new Set(documents.map((doc) => doc.documentType)), [documents]);
  const missingDocuments = REQUIRED_DOCUMENTS.filter((docType) => !foundDocumentTypes.has(docType));
  const docsComplete = missingDocuments.length === 0;
  const hasHaram = ingredients.some((item) => item.status === "Haram");
  const hasOpenAmbiguous = ingredients.some((item) => item.status === "Ambiguous" && !item.isOverridden);
  const canExport = docsComplete && !hasHaram && !hasOpenAmbiguous;

  useEffect(() => {
    const haramItems = ingredients.filter((item) => item.status === "Haram");
    for (const item of haramItems) {
      if (haramAlternatives[item.id] || loadingAlternativesRef.current.has(item.id)) continue;

      loadingAlternativesRef.current.add(item.id);
      void suggestHalalAlternativesAction({
        ingredientName: item.ingredientName,
        normalizedName: item.normalizedName,
      })
        .then((result) => {
          setHaramAlternatives((prev) => ({ ...prev, [item.id]: result.alternatives ?? [] }));
        })
        .finally(() => {
          loadingAlternativesRef.current.delete(item.id);
        });
    }
  }, [ingredients, haramAlternatives]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setIsUploading(true);

    try {
      for (const file of Array.from(fileList)) {
        const text = await readFileText(file);
        if (!text.trim()) continue;

        const ingredientDocSignal = isIngredientDocument(file.name, text);
        const classified = await classifyDocumentAction({ text, fileName: file.name });
        const finalDocumentType: DocumentType = ingredientDocSignal
          ? "ingredient-list"
          : (classified.documentType as DocumentType);

        const documentId = crypto.randomUUID();
        const nextDocument: UploadedDocument = {
          id: documentId,
          name: file.name,
          documentType: finalDocumentType,
          confidence: classified.confidence,
          text: text.slice(0, 4000),
          uploadedAt: new Date().toISOString(),
        };

        setDocuments((prev) => [nextDocument, ...prev]);

        if (ingredientDocSignal) {
          const ingredientResult = await verifyIngredientsAction({ text });
          const generatedIngredients: IngredientVerification[] = ingredientResult.ingredients.map((item) => ({
            id: crypto.randomUUID(),
            ingredientName: item.ingredientName,
            normalizedName: item.normalizedName,
            status: item.status,
            confidence: item.confidence,
            reasoning: item.reasoning,
            sourceDocumentId: documentId,
            sourceDocumentName: file.name,
          }));

          if (generatedIngredients.length > 0) {
            setIngredients((prev) => [...generatedIngredients, ...prev]);
          }
        }
      }
    } finally {
      setIsUploading(false);
    }
  }

  function exportForJakim() {
    const payload = {
      exportedAt: new Date().toISOString(),
      checklistStatus: {
        required: REQUIRED_DOCUMENTS,
        missing: missingDocuments,
      },
      uploadedDocuments: documents,
      ingredientAssessments: ingredients,
    };

    // Download a consolidated export payload.
    const payloadBlob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const payloadUrl = URL.createObjectURL(payloadBlob);
    const payloadAnchor = document.createElement("a");
    payloadAnchor.href = payloadUrl;
    payloadAnchor.download = "HalalChain_Export.json";
    payloadAnchor.click();
    URL.revokeObjectURL(payloadUrl);

    // Download modified document text files for manual upload into MYeHALAL.
    for (const doc of documents) {
      const safeName = doc.name.replace(/[<>:"/\\|?*]+/g, "_");
      const extIndex = safeName.lastIndexOf(".");
      const base = extIndex >= 0 ? safeName.slice(0, extIndex) : safeName;
      const modifiedFileName = `${base}_modified.txt`;

      const fileBlob = new Blob([doc.text || ""], { type: "text/plain;charset=utf-8" });
      const fileUrl = URL.createObjectURL(fileBlob);
      const fileAnchor = document.createElement("a");
      fileAnchor.href = fileUrl;
      fileAnchor.download = modifiedFileName;
      fileAnchor.click();
      URL.revokeObjectURL(fileUrl);
    }

    // Open MYeHALAL sign-in page after download starts.
    window.open(
      "https://myehalal.halal.gov.my/domestik/v1/signin_domestik.php",
      "_blank",
      "noopener,noreferrer"
    );
  }

  function clearUploadedData() {
    setDocuments([]);
    setIngredients([]);
    localStorage.removeItem(STORAGE_KEY);
  }

  function requestSupplierVerification(ingredientId: string) {
    const target = ingredients.find((item) => item.id === ingredientId);
    if (!target) return;
    createSupplierRequest({
      smeName,
      ingredientName: target.ingredientName,
    });
    setRequestMessage(`Supplier verification requested for ${target.ingredientName}.`);
    setTimeout(() => setRequestMessage(""), 2500);
  }

  function applyManualOverride() {
    if (!activeIngredient) return;

    setIngredients((prev) =>
      prev.map((item) =>
        item.id === activeIngredient.id
          ? {
              ...item,
              status: overrideStatus,
              confidence: Math.max(item.confidence, 90),
              isOverridden: true,
              reasoning: `${item.reasoning} Manually overridden by internal halal compliance reviewer.`,
            }
          : item
      )
    );

    setActiveIngredient(null);
  }

  function applyAlternativeReplacement() {
    if (!activeReplacementIngredient || !selectedAlternative) return;

    const target = activeReplacementIngredient;
    const replacement = selectedAlternative.trim();
    if (!replacement) return;

    // Simulate editing the uploaded file by replacing the ingredient token in stored document text.
    setDocuments((prev) =>
      prev.map((doc) =>
        doc.id === target.sourceDocumentId
          ? {
              ...doc,
              text: doc.text.replace(
                new RegExp(target.ingredientName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
                replacement
              ),
            }
          : doc
      )
    );

    // Update the flagged ingredient into a compliant replacement entry.
    setIngredients((prev) =>
      prev.map((item) =>
        item.id === target.id
          ? {
              ...item,
              ingredientName: replacement,
              normalizedName: replacement.toLowerCase(),
              status: "Halal",
              confidence: 95,
              isOverridden: true,
              reasoning: `${item.reasoning} Replaced "${target.ingredientName}" with "${replacement}" via file modification workflow.`,
            }
          : item
      )
    );

    setRequestMessage(`Updated ${target.sourceDocumentName}: replaced ${target.ingredientName} with ${replacement}.`);
    setTimeout(() => setRequestMessage(""), 2800);
    setActiveReplacementIngredient(null);
    setSelectedAlternative("");
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900 md:p-10">
      <div className="mx-auto grid max-w-7xl gap-6">
        <header className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">HalalChain Certification Assistant</h1>
            <p className="text-sm text-slate-600">
              AI-powered prototype workflow to prepare SME submissions for JAKIM Halal certification.
            </p>
          </div>
          <Button variant="secondary" onClick={onLogout}>
            Logout
          </Button>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle>1) Mock Document Upload & Auto-Sort</CardTitle>
              <CardDescription>
                Upload TXT, PDF, and Excel files. Each file is AI-classified and added to your checklist.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void handleFiles(event.dataTransfer.files);
                }}
                className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-100/60 p-8 text-center"
              >
                <UploadCloud className="mx-auto mb-3 h-7 w-7 text-slate-600" />
                <p className="text-sm font-medium">Drag and drop files here</p>
                <p className="mb-4 text-xs text-slate-500">TXT, PDF, XLSX, CSV</p>
                <label>
                  <input
                    type="file"
                    className="hidden"
                    accept=".txt,.pdf,.xlsx,.xls,.csv,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                    multiple
                    onChange={(event) => void handleFiles(event.target.files)}
                  />
                  <span className="inline-flex cursor-pointer rounded-md border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-100">
                    Select files
                  </span>
                </label>
                {isUploading ? <p className="mt-3 text-xs text-slate-500">Analyzing with AI...</p> : null}
              </div>

              <div className="space-y-3">
                {documents.length === 0 ? (
                  <p className="text-sm text-slate-500">No documents uploaded yet.</p>
                ) : (
                  documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-slate-500" />
                        <div>
                          <p className="text-sm font-medium">{doc.name}</p>
                          <p className="text-xs text-slate-500">{DOCUMENT_LABELS[doc.documentType]}</p>
                        </div>
                      </div>
                      <Badge variant="secondary">Confidence {doc.confidence}%</Badge>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2) Compliance Gap Checker</CardTitle>
              <CardDescription>All four mandatory files must be present before export is enabled.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {REQUIRED_DOCUMENTS.map((docType) => {
                  const found = foundDocumentTypes.has(docType);
                  return (
                    <div
                      key={docType}
                      className="flex items-center justify-between rounded-md border border-slate-200 p-3"
                    >
                      <span className="text-sm">{DOCUMENT_LABELS[docType]}</span>
                      {found ? <Badge variant="success">Received</Badge> : <Badge variant="warning">Missing</Badge>}
                    </div>
                  );
                })}
              </div>

              {!docsComplete ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <div className="mb-1 flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4" /> Missing mandatory documents
                  </div>
                  <p>{missingDocuments.map((item) => DOCUMENT_LABELS[item]).join(", ")}</p>
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="h-4 w-4" /> Compliance checklist complete
                  </div>
                </div>
              )}

              {docsComplete && !canExport ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Resolve Haram/Ambiguous ingredients before final export.
                </div>
              ) : null}

              <Button disabled={!canExport} onClick={exportForJakim} className="w-full">
                <Download className="h-4 w-4" />
                Export for JAKIM
              </Button>
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => {
                  if (window.confirm("Remove all uploaded files and ingredient checks?")) {
                    clearUploadedData();
                  }
                }}
              >
                Clear Uploaded Data
              </Button>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>3) Structured Ingredient Halal Verification</CardTitle>
          </CardHeader>
          <CardContent>
            {requestMessage ? (
              <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
                {requestMessage}
              </div>
            ) : null}
            {ingredients.length === 0 ? (
              <p className="text-sm text-slate-500">Upload ingredient-containing documents to see verification cards.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {ingredients.map((ingredient) => (
                  <div key={ingredient.id} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{ingredient.ingredientName}</p>
                        <p className="text-xs text-slate-500">Normalized: {ingredient.normalizedName}</p>
                      </div>
                      <Badge variant={statusBadge(ingredient.status)}>{ingredient.status}</Badge>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>Confidence</span>
                        <span>{ingredient.confidence}%</span>
                      </div>
                      <Progress value={ingredient.confidence} />
                    </div>

                    <details className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                      <summary className="cursor-pointer font-medium">Audit Trail</summary>
                      <p className="mt-2">{ingredient.reasoning}</p>
                    </details>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {ingredient.confidence < 60 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setActiveIngredient(ingredient);
                            setOverrideStatus(ingredient.status);
                          }}
                        >
                          Manual Check
                        </Button>
                      ) : null}
                      {ingredient.status === "Ambiguous" ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => requestSupplierVerification(ingredient.id)}
                        >
                          Request Supplier Verification
                        </Button>
                      ) : null}
                      {ingredient.supplierCertificateUploaded ? (
                        <Badge variant="success">Verified by Supplier</Badge>
                      ) : null}
                    </div>
                    {ingredient.status === "Haram" ? (
                      <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs">
                        <p className="mb-2 font-semibold text-emerald-800">Suggested Halal Alternatives</p>
                        {!haramAlternatives[ingredient.id] ? (
                          <p className="text-emerald-700">Finding alternatives with AI...</p>
                        ) : (
                          <ul className="space-y-2 text-emerald-800">
                            {(haramAlternatives[ingredient.id] ?? []).map((alternative, idx) => (
                              <li key={`${ingredient.id}-alt-${idx}`}>
                                <span className="font-medium">{alternative.name}</span>: {alternative.reason}
                              </li>
                            ))}
                            {(haramAlternatives[ingredient.id] ?? []).length === 0 ? (
                              <li>No alternatives generated yet.</li>
                            ) : null}
                          </ul>
                        )}
                        <div className="mt-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setActiveReplacementIngredient(ingredient);
                              const first = haramAlternatives[ingredient.id]?.[0]?.name ?? "";
                              setSelectedAlternative(first);
                            }}
                          >
                            Modify File & Replace Ingredient
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4">
              <Button disabled={!canExport} onClick={exportForJakim}>
                Verify to JAKIM
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {activeIngredient ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-lg">
            <h2 className="text-lg font-semibold">Manual Check Override</h2>
            <p className="mt-1 text-sm text-slate-600">
              Set final status for <span className="font-medium">{activeIngredient.ingredientName}</span>.
            </p>
            <div className="mt-4 flex gap-2">
              {(["Halal", "Haram", "Ambiguous"] as IngredientStatus[]).map((option) => (
                <Button
                  key={option}
                  variant={overrideStatus === option ? "default" : "outline"}
                  onClick={() => setOverrideStatus(option)}
                >
                  {option}
                </Button>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setActiveIngredient(null)}>
                Cancel
              </Button>
              <Button onClick={applyManualOverride}>Save Override</Button>
            </div>
          </div>
        </div>
      ) : null}

      {activeReplacementIngredient ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-lg">
            <h2 className="text-lg font-semibold">Modify File Ingredient</h2>
            <p className="mt-1 text-sm text-slate-600">
              Source file: <span className="font-medium">{activeReplacementIngredient.sourceDocumentName}</span>
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Replace <span className="font-medium">{activeReplacementIngredient.ingredientName}</span> with:
            </p>

            <select
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={selectedAlternative}
              onChange={(event) => setSelectedAlternative(event.target.value)}
            >
              {(haramAlternatives[activeReplacementIngredient.id] ?? []).map((alternative) => (
                <option key={`${activeReplacementIngredient.id}-${alternative.name}`} value={alternative.name}>
                  {alternative.name}
                </option>
              ))}
            </select>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setActiveReplacementIngredient(null);
                  setSelectedAlternative("");
                }}
              >
                Cancel
              </Button>
              <Button onClick={applyAlternativeReplacement} disabled={!selectedAlternative}>
                Apply Replacement
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <AIChatbox />
    </main>
  );
}
