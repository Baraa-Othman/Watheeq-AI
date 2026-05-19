"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { translations } from "./translations";
import type { Lang } from "./translations";

interface LangContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
  isRTL: boolean;
}

const LangContext = createContext<LangContextType>({
  lang: "en",
  setLang: () => {},
  t: (k) => k,
  isRTL: false,
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("watheeq-lang") as Lang | null;
      if (stored === "ar" || stored === "en") setLangState(stored);
    } catch {
      // localStorage not available (SSR)
    }
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem("watheeq-lang", l); } catch {}
  };

  const t = (key: string): string =>
    translations[key]?.[lang] ?? translations[key]?.["en"] ?? key;

  return (
    <LangContext.Provider value={{ lang, setLang, t, isRTL: lang === "ar" }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
