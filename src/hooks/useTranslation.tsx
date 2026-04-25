"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { type Lang, translations, type TranslationKey } from "@/lib/translations";

type TranslationContextValue = {
  lang: Lang;
  setLang: (next: Lang) => void;
  t: (key: TranslationKey) => string;
};

const TranslationContext = createContext<TranslationContextValue | null>(null);

const LANGUAGE_STORAGE_KEY = "halalchain_lang";

export function TranslationProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window === "undefined") return "en";
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved === "en" || saved === "ms") {
      return saved;
    }
    return "en";
  });

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  function updateLang(next: Lang) {
    setLang(next);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    document.documentElement.lang = next;
  }

  const value = useMemo<TranslationContextValue>(
    () => ({
      lang,
      setLang: updateLang,
      t: (key) => translations[lang][key],
    }),
    [lang]
  );

  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
}

export function useTranslation() {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error("useTranslation must be used inside TranslationProvider");
  }
  return context;
}
