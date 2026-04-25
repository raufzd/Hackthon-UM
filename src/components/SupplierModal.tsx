"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import type { SupplierResolutionStatus } from "@/types/app";

type SupplierModalProps = {
  open: boolean;
  requestId: string;
  ingredient: string;
  smeName: string;
  onClose: () => void;
  onSubmit: (payload: {
    id: string;
    status: SupplierResolutionStatus;
    certificateFileName?: string;
    supportingEvidence?: string;
    declarationConfirmed: boolean;
  }) => void;
};

export function SupplierModal({ open, requestId, ingredient, smeName, onClose, onSubmit }: SupplierModalProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SupplierResolutionStatus | "">("");
  const [certificateFileName, setCertificateFileName] = useState("");
  const [supportingEvidence, setSupportingEvidence] = useState("");
  const [declarationConfirmed, setDeclarationConfirmed] = useState(false);

  if (!open) return null;

  function submit() {
    if (!status || !declarationConfirmed) return;
    onSubmit({
      id: requestId,
      status,
      certificateFileName: certificateFileName || undefined,
      supportingEvidence: supportingEvidence || undefined,
      declarationConfirmed,
    });
    setStatus("");
    setCertificateFileName("");
    setSupportingEvidence("");
    setDeclarationConfirmed(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white">
        <div className="border-b border-slate-200 p-4">
          <h3 className="text-lg font-semibold">Respond to Verification Request</h3>
        </div>
        <div className="space-y-3 p-4 text-sm">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p>
              <strong>SME:</strong> {smeName}
            </p>
            <p>
              <strong>Ingredient:</strong> {ingredient}
            </p>
          </div>
          <div>
            <label className="mb-1 block font-medium">Declare Ingredient Status</label>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={status}
              onChange={(e) => setStatus(e.target.value as SupplierResolutionStatus)}
            >
              <option value="">Select status</option>
              <option value="Halal">Halal</option>
              <option value="Haram">Haram</option>
              <option value="Unknown">Unknown</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block font-medium">Upload Halal Certificate (Mock)</label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              onChange={(e) => setCertificateFileName(e.target.files?.[0]?.name ?? "")}
            />
            {certificateFileName ? (
              <p className="mt-1 text-xs text-slate-500">Selected: {certificateFileName}</p>
            ) : null}
          </div>
          <div>
            <label className="mb-1 block font-medium">Supporting Evidence (e.g., Cert No)</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={supportingEvidence}
              onChange={(e) => setSupportingEvidence(e.target.value)}
              placeholder="e.g. JAKIM/2024/XYZ-001"
            />
          </div>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={declarationConfirmed}
              onChange={(e) => setDeclarationConfirmed(e.target.checked)}
            />
            <span>I confirm this declaration is accurate and authorized for SME verification.</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} disabled={!status || !declarationConfirmed}>
            {t("submitDeclaration")}
          </Button>
        </div>
      </div>
    </div>
  );
}
