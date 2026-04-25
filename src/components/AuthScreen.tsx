"use client";

import { useState } from "react";

import { useTranslation } from "@/hooks/useTranslation";
import type { AuthMode, AuthUser, UserRole } from "@/types/app";

type AuthScreenProps = {
  onAuthenticate: (user: AuthUser) => void;
};

export function AuthScreen({ onAuthenticate }: AuthScreenProps) {
  const { lang, setLang, t } = useTranslation();
  const [mode, setMode] = useState<AuthMode>("login");
  const [role, setRole] = useState<UserRole | "">("");
  const [regNo, setRegNo] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [authError, setAuthError] = useState("");

  function submitAuth(event: React.FormEvent) {
    event.preventDefault();
    setAuthError("");
    if (!role) {
      setAuthError("Please choose an account type first.");
      return;
    }
    if (mode === "register" && !agreeTerms) {
      setAuthError("Please confirm the declaration checkbox.");
      return;
    }

    const fallbackName = role === "sme" ? "Keropok Mak Cik Sdn Bhd" : "XYZ Ingredients Sdn Bhd";
    onAuthenticate({
      role,
      regNo,
      name: companyName.trim() || fallbackName,
    });
  }

  function quickLogin(nextRole: UserRole) {
    setAuthError("");
    onAuthenticate({
      role: nextRole,
      regNo: regNo.trim() || "20240101 (1234567-X)",
      name: nextRole === "sme" ? "Keropok Mak Cik Sdn Bhd" : "XYZ Ingredients Sdn Bhd",
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#f0fdf4_0%,#f8fafc_100%)] p-6">
      <div className="w-full max-w-xl space-y-6">
        <header className="space-y-3 text-center">
          <div className="flex items-center justify-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white">H</div>
            <div className="text-left">
              <p className="text-xl font-bold text-primary">{t("appTitle")}</p>
              <p className="text-sm text-slate-500">{t("appSubtitle")}</p>
            </div>
          </div>
          <p className="inline-flex rounded-full bg-primary px-3 py-1 text-xs font-medium text-white">{t("hackathon")}</p>
          <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 text-xs">
            <button
              className={`rounded-full px-3 py-1 ${lang === "en" ? "bg-primary text-white" : "text-slate-600"}`}
              onClick={() => setLang("en")}
              type="button"
            >
              EN
            </button>
            <button
              className={`rounded-full px-3 py-1 ${lang === "ms" ? "bg-primary text-white" : "text-slate-600"}`}
              onClick={() => setLang("ms")}
              type="button"
            >
              BM
            </button>
          </div>
        </header>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
          <div className="mb-6 flex border-b border-slate-200">
            <button
              className={`flex-1 border-b-2 px-4 py-3 text-sm font-medium ${mode === "login" ? "border-primary text-primary" : "border-transparent text-slate-500"}`}
              onClick={() => setMode("login")}
              type="button"
            >
              {t("login")}
            </button>
            <button
              className={`flex-1 border-b-2 px-4 py-3 text-sm font-medium ${mode === "register" ? "border-primary text-primary" : "border-transparent text-slate-500"}`}
              onClick={() => setMode("register")}
              type="button"
            >
              {t("register")}
            </button>
          </div>

          <form className="space-y-4" onSubmit={submitAuth}>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("accountType")}</label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-primary"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                required
              >
                <option value="">{t("selectAccountType")}</option>
                <option value="sme">{t("smeProducer")}</option>
                <option value="supplier">{t("ingredientSupplier")}</option>
              </select>
            </div>

            {mode === "register" ? (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium">{t("companyName")}</label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-primary"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">{t("businessEmail")}</label>
                  <input
                    type="email"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-primary"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </>
            ) : null}

            <div>
              <label className="mb-1 block text-sm font-medium">{t("companyRegNo")}</label>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-primary"
                value={regNo}
                onChange={(e) => setRegNo(e.target.value)}
                placeholder={t("regNoHint")}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">{t("password")}</label>
              <input
                type="password"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-primary"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>

            {mode === "register" ? (
              <label className="flex items-start gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} />
                {t("agreeTerms")}
              </label>
            ) : null}

            <button className="w-full rounded-lg bg-primary px-4 py-2 font-medium text-white hover:bg-primary-dark" type="submit">
              {mode === "login" ? t("loginDashboard") : t("registerAccount")}
            </button>
            {authError ? <p className="text-sm text-rose-600">{authError}</p> : null}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-medium text-slate-600">Quick access (mock auth)</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-xs hover:bg-white"
                  onClick={() => quickLogin("sme")}
                >
                  Enter as SME
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-xs hover:bg-white"
                  onClick={() => quickLogin("supplier")}
                >
                  Enter as Supplier
                </button>
              </div>
            </div>
          </form>
        </div>

        <footer className="text-center text-xs text-slate-500">
          <p>{t("poweredBy")}</p>
          <p className="mt-1 italic">{t("disclaimer")}</p>
        </footer>
      </div>
    </div>
  );
}
