"use client";

import { useState } from "react";

import { AuthScreen } from "@/components/AuthScreen";
import { LegacySmeDashboard } from "@/components/LegacySmeDashboard";
import { SupplierDashboard } from "@/components/SupplierDashboard";
import { TranslationProvider } from "@/hooks/useTranslation";
import type { AuthUser } from "@/types/app";

const AUTH_STORAGE_KEY = "halalchain_user";

function AppShell() {
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as AuthUser;
      return parsed?.role ? parsed : null;
    } catch {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
  });

  function onAuthenticate(next: AuthUser) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
    setUser(next);
  }

  function onLogout() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setUser(null);
  }

  if (!user) {
    return <AuthScreen onAuthenticate={onAuthenticate} />;
  }

  if (user.role === "supplier") {
    return <SupplierDashboard user={user} onLogout={onLogout} />;
  }

  return <LegacySmeDashboard onLogout={onLogout} smeName={user.name} />;
}

export default function DashboardClient() {
  return (
    <TranslationProvider>
      <AppShell />
    </TranslationProvider>
  );
}
