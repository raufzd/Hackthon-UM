"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useTranslation } from "@/hooks/useTranslation";
import {
  createSupplierRequest,
  getSupplierRequests,
  subscribeSupplierRequests,
} from "@/lib/mockDatabase";
import type { IngredientStatus, IngredientVerification } from "@/types/halal";

type IngredientListProps = {
  ingredients: IngredientVerification[];
  onUpdateIngredient: (id: string, next: Partial<IngredientVerification>) => void;
  smeName?: string;
};

export function IngredientList({ ingredients, onUpdateIngredient, smeName = "SME User" }: IngredientListProps) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manualStatus, setManualStatus] = useState<IngredientStatus>("Halal");

  const hasHaram = useMemo(() => ingredients.some((item) => item.status === "Haram"), [ingredients]);
  const [requestMessage, setRequestMessage] = useState("");

  const selected = ingredients.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    const applyResolved = () => {
      const resolved = getSupplierRequests().filter((request) => request.status === "resolved" && request.resolutionStatus);
      for (const request of resolved) {
        if (!request.resolutionStatus) continue;
        const match = ingredients.find(
          (ingredient) => ingredient.ingredientName.toLowerCase() === request.ingredientName.toLowerCase()
        );
        if (!match) continue;

        const mappedStatus: IngredientStatus =
          request.resolutionStatus === "Unknown" ? "Ambiguous" : request.resolutionStatus;

        if (match.supplierCertificateUploaded && match.status === mappedStatus) {
          continue;
        }

        onUpdateIngredient(match.id, {
          status: mappedStatus,
          supplierCertificateUploaded: true,
          confidence: Math.max(match.confidence, 95),
        });
      }
    };
    applyResolved();
    return subscribeSupplierRequests(applyResolved);
  }, [ingredients, onUpdateIngredient]);

  return (
    <div className="space-y-4">
      {requestMessage ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">{requestMessage}</div>
      ) : null}
      {hasHaram ? (
        <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
          {t("statusHaram")} item detected. Replace before export.
        </div>
      ) : null}

      {ingredients.length === 0 ? <p className="text-sm text-slate-500">No ingredients extracted yet.</p> : null}
      {ingredients.map((ingredient) => {
        const variant =
          ingredient.status === "Halal" ? "success" : ingredient.status === "Haram" ? "danger" : "warning";

        return (
          <div key={ingredient.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-semibold">{ingredient.ingredientName}</p>
              <Badge variant={variant}>{ingredient.status}</Badge>
            </div>
            <p className="text-xs text-slate-500">Normalized: {ingredient.normalizedName}</p>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <span>Confidence</span>
              <Progress value={ingredient.confidence} className="max-w-40" />
              <span>{ingredient.confidence}%</span>
            </div>
            <details className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
              <summary>Audit Trail</summary>
              <p className="mt-1">{ingredient.reasoning}</p>
            </details>
            <div className="mt-3 flex flex-wrap gap-2">
              {ingredient.confidence < 60 ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSelectedId(ingredient.id);
                    setManualStatus(ingredient.status);
                  }}
                >
                  Manual Check
                </Button>
              ) : null}
              {ingredient.status === "Ambiguous" && ingredient.confidence < 70 ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    createSupplierRequest({
                      smeName,
                      ingredientName: ingredient.ingredientName,
                    });
                    setRequestMessage(`Supplier verification requested for ${ingredient.ingredientName}.`);
                    setTimeout(() => setRequestMessage(""), 2500);
                  }}
                >
                  Request Supplier Verification
                </Button>
              ) : null}
              {ingredient.supplierCertificateUploaded ? (
                <Badge variant="success">Verified by Supplier</Badge>
              ) : null}
            </div>
          </div>
        );
      })}

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5">
            <p className="text-lg font-semibold">Manual Halal Declaration</p>
            <p className="mt-1 text-sm text-slate-600">{selected.ingredientName}</p>
            <div className="mt-3 flex gap-2">
              {(["Halal", "Haram", "Ambiguous"] as IngredientStatus[]).map((option) => (
                <Button
                  key={option}
                  variant={option === manualStatus ? "default" : "outline"}
                  onClick={() => setManualStatus(option)}
                >
                  {option}
                </Button>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedId(null)}>
                {t("cancel")}
              </Button>
              <Button
                onClick={() => {
                  onUpdateIngredient(selected.id, {
                    status: manualStatus,
                    confidence: 100,
                    isOverridden: true,
                  });
                  setSelectedId(null);
                }}
              >
                {t("submitDeclaration")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
