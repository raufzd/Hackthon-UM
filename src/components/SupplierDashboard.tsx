"use client";

import { useEffect, useMemo, useState } from "react";

import { resolveSupplierRequest, getSupplierRequests, subscribeSupplierRequests } from "@/lib/mockDatabase";
import { Sidebar } from "@/components/Sidebar";
import { SupplierModal } from "@/components/SupplierModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import type { AuthUser, SupplierRequest, SupplierSection } from "@/types/app";

type SupplierDashboardProps = {
  user: AuthUser;
  onLogout: () => void;
};

export function SupplierDashboard({ user, onLogout }: SupplierDashboardProps) {
  const { t, lang, setLang } = useTranslation();
  const [section, setSection] = useState<SupplierSection>("requests");
  const [requests, setRequests] = useState<SupplierRequest[]>([]);
  const [activeRequest, setActiveRequest] = useState<SupplierRequest | null>(null);
  const [syncMessage, setSyncMessage] = useState("");

  useEffect(() => {
    const refresh = () => setRequests(getSupplierRequests());
    refresh();
    return subscribeSupplierRequests(refresh);
  }, []);

  const pendingRequests = useMemo(() => requests.filter((request) => request.status === "pending"), [requests]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white">H</div>
            <div>
              <p className="font-semibold text-primary">{t("appTitle")}</p>
              <p className="text-xs text-slate-500">{t("supplierPortal")}</p>
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
            <Button size="sm" variant="secondary" onClick={onLogout}>
              {t("logout")}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 p-6 lg:grid-cols-[280px_1fr]">
        <Sidebar
          items={[
            { id: "requests", label: t("navRequests") },
            { id: "certificates", label: t("navCertificates") },
          ]}
          active={section}
          onSelect={(id) => setSection(id as SupplierSection)}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("certStatus")}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">{t("jakimCertified")}</p>
              <p className="mt-2">Cert No: JAKIM/2024/XYZ-001</p>
            </CardContent>
          </Card>
        </Sidebar>

        <main>
          {section === "requests" ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("pendingRequests")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingRequests.length === 0 ? (
                  <p className="text-sm text-slate-500">No pending supplier verification requests.</p>
                ) : null}
                {pendingRequests.map((request) => (
                  <div key={request.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold">{request.smeName}</p>
                        <p className="text-sm text-slate-500">{request.ingredientName}</p>
                        <p className="text-xs text-slate-500">
                          Requested: {new Date(request.timestamp).toLocaleString()}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setActiveRequest(request)}>
                        Resolve Request
                      </Button>
                    </div>
                  </div>
                ))}
                {syncMessage ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                    {syncMessage}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {section === "certificates" ? (
            <Card>
              <CardHeader>
                <CardTitle>Manage Halal Certificates</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <label className="block cursor-pointer rounded-xl border-2 border-dashed border-slate-300 p-6 text-center text-sm">
                  Upload JAKIM Halal Certificate (PDF)
                  <input type="file" className="hidden" accept=".pdf" />
                </label>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                  JAKIM Halal Certificate • valid until 31 Dec 2026
                </div>
              </CardContent>
            </Card>
          ) : null}
        </main>
      </div>

      <SupplierModal
        open={Boolean(activeRequest)}
        requestId={activeRequest?.id ?? ""}
        ingredient={activeRequest?.ingredientName ?? ""}
        smeName={activeRequest?.smeName ?? ""}
        onClose={() => setActiveRequest(null)}
        onSubmit={(payload) => {
          if (!activeRequest) return;
          resolveSupplierRequest({
            id: payload.id,
            resolutionStatus: payload.status,
            supportingEvidence: payload.supportingEvidence,
            uploadedCertificateName: payload.certificateFileName,
          });
          setSyncMessage("Update synced to SME dashboard.");
          setTimeout(() => setSyncMessage(""), 2800);
          setActiveRequest(null);
        }}
      />
    </div>
  );
}
