"use client";

import { useLang } from "@/lib/lang-context";

interface LangToggleProps {
  className?: string;
  compact?: boolean;
}

export default function LangToggle({ className = "", compact = true }: LangToggleProps) {
  const { lang, setLang } = useLang();

  return (
    <button
      onClick={() => setLang(lang === "en" ? "ar" : "en")}
      title={lang === "en" ? "Switch to Arabic / التغيير للعربية" : "Switch to English / التغيير للإنجليزية"}
      className={`inline-flex items-center gap-1 rounded-md border font-bold transition-all shrink-0 select-none ${className}`}
      style={{
        padding: compact ? "1px 4px" : "3px 6px",
        fontSize: compact ? "9px" : "10px",
        borderColor: "#e2e2ee",
        color: "#0004E8",
        background: "transparent",
        cursor: "pointer",
        lineHeight: 1,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,4,232,0.06)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <svg width={compact ? "9" : "10"} height={compact ? "9" : "10"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="shrink-0">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
      </svg>
      <span>{lang === "en" ? "عربي" : "EN"}</span>
    </button>
  );
}
