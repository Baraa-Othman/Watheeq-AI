"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { apiFetchAuth, API_BASE_URL } from "@/lib/apiClient";
import { useLang } from "@/lib/lang-context";

interface Policy { id: string; policy_name: string; }

const MAX_FILE_BYTES = 15 * 1024 * 1024;

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[12px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "rgba(5,5,8,0.4)" }}>
      {children}
    </label>
  );
}

// ── English-only hint ───────────────────────────────────────────────────────
function EnglishOnlyHint() {
  const { isRTL, t } = useLang();
  const hint = t("englishOnlyHint");
  if (!isRTL || !hint) return null;
  return (
    <p style={{ fontSize: 11, color: "#b45309", marginTop: 3, fontWeight: 500 }}>
      {hint}
    </p>
  );
}

const inputClass = "w-full px-3.5 py-2.5 rounded-xl border text-[14px] outline-none transition-all focus:ring-[3px] focus:ring-blue-100";
const inputStyle = { borderColor: "#e8e8f0", color: "#050508" };
function formatBytes(b: number) { return `${(b / 1048576).toFixed(1)} MB`; }

// ── Custom Date Picker (YYYY/DD/MM sent to backend, displayed as YYYY/MM/DD) ─
const MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const DAYS_EN   = ["Su","Mo","Tu","We","Th","Fr","Sa"];
const DAYS_AR   = ["أح","إث","ثل","أر","خم","جم","سب"];

function DatePickerInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { isRTL, t } = useLang();
  const MONTHS = isRTL ? MONTHS_AR : MONTHS_EN;
  const DAY_HEADERS = isRTL ? DAYS_AR : DAYS_EN;

  const [yyyy, setYyyy] = useState("");
  const [mm, setMm]     = useState("");
  const [dd, setDd]     = useState("");
  const [open, setOpen]   = useState(false);
  const [calYear, setCalYear]   = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [focused, setFocused]   = useState(false);
  const yyyyRef = useRef<HTMLInputElement>(null);
  const mmRef   = useRef<HTMLInputElement>(null);
  const ddRef   = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) {
      const [y, d, m] = value.split("/");
      setYyyy(y ?? ""); setDd(d ?? ""); setMm(m ?? "");
    } else {
      setYyyy(""); setMm(""); setDd("");
    }
  }, [value]);

  const emit = useCallback((y: string, d: string, m: string) => {
    if (y.length === 4 && d !== "" && m !== "") {
      onChange(`${y}/${d}/${m}`);
    } else {
      onChange("");
    }
  }, [onChange]);

  const handleYyyy = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, "").slice(0, 4);
    setYyyy(v); emit(v, dd, mm);
    if (v.length === 4) mmRef.current?.focus();
  };
  const handleMm = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
    setMm(raw); emit(yyyy, dd, raw);
    if (raw.length === 2 || (raw.length === 1 && Number(raw) > 1)) ddRef.current?.focus();
  };
  const handleDd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
    setDd(raw); emit(yyyy, raw, mm);
  };
  const blurMm = () => {
    setFocused(false);
    if (mm !== "") { const c = String(Math.min(12, Math.max(1, Number(mm)))).padStart(2, "0"); setMm(c); emit(yyyy, dd, c); }
  };
  const blurDd = () => {
    setFocused(false);
    if (dd !== "") { const c = String(Math.min(31, Math.max(1, Number(dd)))).padStart(2, "0"); setDd(c); emit(yyyy, c, mm); }
  };
  const handleDdKey = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Backspace" && dd === "") mmRef.current?.focus(); };
  const handleMmKey = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Backspace" && mm === "") yyyyRef.current?.focus(); };

  const pickCalDay = (day: number) => {
    const y = String(calYear);
    const d = String(day).padStart(2, "0");
    const m = String(calMonth + 1).padStart(2, "0");
    setYyyy(y); setDd(d); setMm(m);
    onChange(`${y}/${d}/${m}`);
    setOpen(false);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const daysInMonth    = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay();
  const isFilled       = yyyy.length === 4 && mm !== "" && dd !== "";
  const borderColor    = open || focused ? "#0004E8" : isFilled ? "#0004E8" : "#e8e8f0";
  const ringStyle      = open || focused ? "0 0 0 3px rgba(0,4,232,0.12)" : "none";
  const allEmpty       = !yyyy && !mm && !dd;

  // Always LTR — date fields are numeric/universal
  return (
    <div ref={wrapRef} style={{ position: "relative" }} dir="ltr">
      <div
        style={{
          display: "flex", alignItems: "center",
          border: `1px solid ${borderColor}`, borderRadius: 12, background: "#fff",
          boxShadow: ringStyle, transition: "border-color 0.15s, box-shadow 0.15s",
          padding: "0 14px", height: 44, cursor: "text",
        }}
        onClick={() => yyyyRef.current?.focus()}
      >
        {/* Calendar icon */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          style={{ display: "flex", alignItems: "center", marginRight: 8, color: open ? "#0004E8" : "rgba(5,5,8,0.35)", transition: "color 0.15s", flexShrink: 0 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </button>

        <span style={{ fontSize: 13, color: "rgba(5,5,8,0.3)", marginRight: 2, flexShrink: 0, userSelect: "none", visibility: allEmpty ? "visible" : "hidden", width: allEmpty ? "auto" : 0, overflow: "hidden" }}>e.g.</span>

        <input ref={yyyyRef} type="text" inputMode="numeric" maxLength={4} placeholder="2011" value={yyyy} onChange={handleYyyy} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{ width: 48, border: "none", outline: "none", fontSize: 14, color: yyyy ? "#050508" : "rgba(5,5,8,0.3)", background: "transparent", textAlign: "center", fontFamily: "inherit" }} />
        <span style={{ color: "rgba(5,5,8,0.3)", fontSize: 14, userSelect: "none", margin: "0 1px" }}>/</span>
        <input ref={mmRef} type="text" inputMode="numeric" maxLength={2} placeholder="7" value={mm} onChange={handleMm} onKeyDown={handleMmKey} onFocus={() => setFocused(true)} onBlur={blurMm}
          style={{ width: 26, border: "none", outline: "none", fontSize: 14, color: mm ? "#050508" : "rgba(5,5,8,0.3)", background: "transparent", textAlign: "center", fontFamily: "inherit" }} />
        <span style={{ color: "rgba(5,5,8,0.3)", fontSize: 14, userSelect: "none", margin: "0 1px" }}>/</span>
        <input ref={ddRef} type="text" inputMode="numeric" maxLength={2} placeholder="13" value={dd} onChange={handleDd} onKeyDown={handleDdKey} onFocus={() => setFocused(true)} onBlur={blurDd}
          style={{ width: 26, border: "none", outline: "none", fontSize: 14, color: dd ? "#050508" : "rgba(5,5,8,0.3)", background: "transparent", textAlign: "center", fontFamily: "inherit" }} />

        {isFilled && (
          <button type="button" onClick={(e) => { e.stopPropagation(); setYyyy(""); setDd(""); setMm(""); onChange(""); }}
            style={{ marginLeft: "auto", color: "rgba(5,5,8,0.3)", display: "flex", alignItems: "center", transition: "color 0.15s", flexShrink: 0 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#dc2626")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(5,5,8,0.3)")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Calendar dropdown — always LTR */}
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50, background: "#fff", border: "1px solid #e8e8f0", borderRadius: 16, padding: "16px 16px 12px", boxShadow: "0 8px 32px rgba(5,5,8,0.12), 0 2px 8px rgba(5,5,8,0.06)", minWidth: 280 }}>
          {/* Header: Year select + Month arrows */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 8 }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <select value={calYear} onChange={(e) => setCalYear(Number(e.target.value))}
                style={{ appearance: "none", WebkitAppearance: "none", border: "1px solid #e8e8f0", borderRadius: 8, background: "#fafafd", padding: "5px 28px 5px 10px", fontSize: 14, fontWeight: 600, color: "#050508", cursor: "pointer", outline: "none", fontFamily: "inherit" }}>
                {Array.from({ length: 101 }, (_, i) => new Date().getFullYear() - 100 + i).reverse().map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <svg style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "rgba(5,5,8,0.4)" }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button type="button" onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear((y) => y - 1); } else setCalMonth((m) => m - 1); }}
                style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid #e8e8f0", background: "#fafafd", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "rgba(5,5,8,0.5)", flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#050508", minWidth: isRTL ? 80 : 70, textAlign: "center" }}>
                {MONTHS[calMonth]}
              </span>
              <button type="button" onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear((y) => y + 1); } else setCalMonth((m) => m + 1); }}
                style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid #e8e8f0", background: "#fafafd", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "rgba(5,5,8,0.5)", flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6" /></svg>
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
            {DAY_HEADERS.map((d) => (
              <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "rgba(5,5,8,0.35)", paddingBottom: 4 }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const isSel = Number(dd) === day && Number(mm) === calMonth + 1 && Number(yyyy) === calYear;
              return (
                <button key={day} type="button" onClick={() => pickCalDay(day)}
                  style={{ width: "100%", aspectRatio: "1", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: isSel ? 700 : 400, background: isSel ? "#0004E8" : "transparent", color: isSel ? "#fff" : "#050508", transition: "background 0.12s" }}
                  onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "rgba(0,4,232,0.08)"; }}
                  onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}>
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Upload zone ──────────────────────────────────────────────────────────────
interface UploadZoneProps {
  label: string;
  isRequired: boolean;
  uploadedUrl: string;
  onUploadComplete: (url: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getToken: () => Promise<string>;
  endpoint: string;
}

function UploadZone({ label, isRequired, uploadedUrl, onUploadComplete, getToken, endpoint }: UploadZoneProps) {
  const { t } = useLang();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(""); onUploadComplete("");
    const f = e.target.files?.[0] ?? null;
    if (!f) { setFile(null); return; }
    if (!f.name.toLowerCase().endsWith(".pdf") || !f.type.includes("pdf")) { setFileError("Please select a PDF file."); setFile(null); return; }
    if (f.size > MAX_FILE_BYTES) { setFileError("File exceeds 15 MB limit."); setFile(null); return; }
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setFileError(""); setUploading(true);
    try {
      const token = await getToken();
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch(`${API_BASE_URL}${endpoint}`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");
      onUploadComplete(data.url);
    } catch (err: unknown) { setFileError(err instanceof Error ? err.message : "Upload failed"); }
    finally { setUploading(false); }
  };

  const reset = () => { setFile(null); onUploadComplete(""); setFileError(""); if (inputRef.current) inputRef.current.value = ""; };

  return (
    <div>
      <FieldLabel>
        {label}{" "}
        <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "rgba(5,5,8,0.35)" }}>
          (PDF, max 15 MB{!isRequired ? `, ${t("pdfOptional")}` : ""})
        </span>
      </FieldLabel>

      <div
        className="rounded-xl border-2 border-dashed p-5 flex flex-col items-center gap-3 cursor-pointer transition-all"
        style={{ borderColor: uploadedUrl ? "#16a34a" : file ? "#0004E8" : "#e8e8f0", background: uploadedUrl ? "rgba(22,163,74,0.04)" : file ? "rgba(0,4,232,0.03)" : "#fafafd" }}
        onClick={() => !uploadedUrl && inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleSelect} />

        {uploadedUrl ? (
          <>
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(22,163,74,0.1)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M8 12.5l3 3 5-5.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div className="text-center">
              <p className="text-[13px] font-semibold" style={{ color: "#15803d" }}>{t("uploadedOK")}</p>
              {file && <p className="text-[11px] mt-0.5 truncate max-w-xs" style={{ color: "rgba(5,5,8,0.4)" }} dir="ltr">{file.name}</p>}
            </div>
            <button onClick={(e) => { e.stopPropagation(); reset(); }} className="text-[12px] font-medium" style={{ color: "#dc2626" }}>{t("remove")}</button>
          </>
        ) : file ? (
          <>
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(0,4,232,0.08)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0004E8" strokeWidth="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            </div>
            <div className="text-center">
              <p className="text-[13px] font-semibold truncate max-w-xs" style={{ color: "#050508" }} dir="ltr">{file.name}</p>
              <p className="text-[11px] mt-0.5" style={{ color: "rgba(5,5,8,0.4)" }}>{formatBytes(file.size)}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={(e) => { e.stopPropagation(); handleUpload(); }} disabled={uploading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: "#0004E8" }}>
                {uploading ? (<><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>{t("uploadingBtn")}</>) : t("upload")}
              </button>
              <button onClick={(e) => { e.stopPropagation(); reset(); }} className="px-3 py-2 rounded-lg text-[13px] font-medium border" style={{ borderColor: "#e8e8f0", color: "rgba(5,5,8,0.5)" }}>{t("change")}</button>
            </div>
          </>
        ) : (
          <>
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#f0f0f5" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(5,5,8,0.4)" strokeWidth="1.8"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            </div>
            <p className="text-[14px] font-medium" style={{ color: "#050508" }}>{t("clickSelectPDF")}</p>
            <p className="text-[12px]" style={{ color: "rgba(5,5,8,0.4)" }}>{t("maxFileSize")}</p>
          </>
        )}
      </div>
      {fileError && <p className="text-[12px] mt-1.5" style={{ color: "#dc2626" }} dir="ltr">{fileError}</p>}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function NewClaimPage() {
  const { user } = useAuth();
  const { t, isRTL } = useLang();
  const router = useRouter();

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loadingPolicies, setLoadingPolicies] = useState(true);
  const [form, setForm] = useState({ patientFName: "", patientLName: "", patientDOB: "", policyName: "", treatmentType: "" });
  const [medUrl, setMedUrl] = useState("");
  const [docsUrl, setDocsUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [claimId, setClaimId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    apiFetchAuth("/api/policies", user)
      .then(async (r) => { const d = await r.json(); if (r.ok) setPolicies(Array.isArray(d) ? d : d.policies ?? []); })
      .catch(() => {})
      .finally(() => setLoadingPolicies(false));
  }, [user]);

  const setField = (f: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [f]: e.target.value }));

  const getToken = async () => { if (!user) throw new Error("Not authenticated"); return user.getIdToken(); };

  const isValid = form.patientFName.trim() && form.patientLName.trim() && form.patientDOB && form.policyName.trim() && form.treatmentType.trim() && medUrl;

  const handleSubmit = async () => {
    if (!user || !isValid) return;
    setError(""); setSubmitting(true);
    try {
      const res = await apiFetchAuth("/api/claims", user, {
        method: "POST",
        body: JSON.stringify({ patientFName: form.patientFName.trim(), patientLName: form.patientLName.trim(), patientDOB: form.patientDOB, policyName: form.policyName, treatmentType: form.treatmentType.trim(), medicalReport: medUrl, supportingDocuments: docsUrl || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to submit claim");
      setClaimId(data.claimId);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Submission failed"); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-7">
        <button onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium mb-4 hover:opacity-70 transition-opacity"
          style={{ color: "rgba(5,5,8,0.45)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: isRTL ? "scaleX(-1)" : "none" }}>
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {t("back")}
        </button>
        <h1 className="text-[26px] font-bold tracking-tight" style={{ color: "#050508" }}>{t("submitNewClaim")}</h1>
        <p className="text-[14px] mt-0.5" style={{ color: "rgba(5,5,8,0.45)" }}>{t("submitNewClaimSub")}</p>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mb-5 px-4 py-3 rounded-xl text-sm flex items-center gap-2.5"
            style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span dir="ltr">{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="rounded-2xl border overflow-hidden" style={{ background: "#fff", borderColor: "#e8e8f0", boxShadow: "0 1px 3px rgba(5,5,8,0.03), 0 6px 24px rgba(5,5,8,0.04)" }}>
        {/* Patient section */}
        <div className="px-6 pt-6 pb-3 border-b" style={{ borderColor: "#f0f0f5" }}>
          <p className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: "#0004E8" }}>{t("patientInfo")}</p>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>{t("firstNameField")}</FieldLabel>
              <input className={inputClass} style={inputStyle} placeholder="e.g. Khalid" value={form.patientFName} onChange={setField("patientFName")} dir="ltr" />
              <EnglishOnlyHint />
            </div>
            <div>
              <FieldLabel>{t("lastNameField")}</FieldLabel>
              <input className={inputClass} style={inputStyle} placeholder="e.g. Al-Mansouri" value={form.patientLName} onChange={setField("patientLName")} dir="ltr" />
              <EnglishOnlyHint />
            </div>
          </div>
          <div>
            <FieldLabel>{t("dobField")}</FieldLabel>
            <DatePickerInput value={form.patientDOB} onChange={(v) => setForm((p) => ({ ...p, patientDOB: v }))} />
          </div>
        </div>

        {/* Claim details section */}
        <div className="px-6 pb-3 border-t" style={{ borderColor: "#f0f0f5" }}>
          <p className="text-[12px] font-semibold uppercase tracking-widest pt-4" style={{ color: "#0004E8" }}>{t("claimDetails")}</p>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <FieldLabel>{t("policyPlanField")}</FieldLabel>
            <select className={inputClass} style={{ ...inputStyle, background: "#fff" }} value={form.policyName} onChange={setField("policyName")} disabled={loadingPolicies} dir="ltr">
              <option value="">{loadingPolicies ? t("loadingPolicies") : t("selectPolicy")}</option>
              {policies.map((p) => <option key={p.id} value={p.policy_name}>{p.policy_name}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>{t("treatmentField")}</FieldLabel>
            <input className={inputClass} style={inputStyle} placeholder="e.g. Physiotherapy, Surgery, Diagnostic Imaging" value={form.treatmentType} onChange={setField("treatmentType")} dir="ltr" />
            <EnglishOnlyHint />
          </div>

          <div data-testid="upload-medical-report">
            <UploadZone label={`${t("medReportField")} *`} isRequired={true} uploadedUrl={medUrl} onUploadComplete={setMedUrl} getToken={getToken} endpoint="/api/claims/upload-medical-report" />
          </div>
          <div data-testid="upload-supporting-docs">
            <UploadZone label={t("supportDocsField")} isRequired={false} uploadedUrl={docsUrl} onUploadComplete={setDocsUrl} getToken={getToken} endpoint="/api/claims/upload-supporting-docs" />
          </div>
        </div>

        {/* Submit */}
        <div className="px-6 pb-6 pt-2">
          <button onClick={handleSubmit} disabled={submitting || !isValid}
            className="w-full py-3 rounded-xl text-[14px] font-semibold text-white transition-all disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ background: "#0004E8" }}
            onMouseEnter={(e) => { if (!submitting && isValid) (e.currentTarget as HTMLElement).style.background = "#2a2eed"; }}
            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "#0004E8"}
          >
            {submitting ? (<><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>{t("submittingBtn")}</>) : t("submitBtn")}
          </button>
          {!medUrl && <p className="text-[11px] text-center mt-2" style={{ color: "rgba(5,5,8,0.35)" }}>{t("uploadToEnable")}</p>}
        </div>
      </div>

      <div className="h-20 lg:h-0" />

      {/* Confirmation Modal */}
      <AnimatePresence>
        {claimId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-5"
            style={{ background: "rgba(5,5,8,0.45)" }}>
            <motion.div initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              className="rounded-2xl p-8 max-w-sm w-full text-center"
              style={{ background: "#fff", boxShadow: "0 24px 64px rgba(5,5,8,0.18)" }}>
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: "rgba(22,163,74,0.1)" }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M8 12.5l3 3 5-5.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <h2 className="text-[20px] font-bold mb-2" style={{ color: "#050508" }}>{t("claimSubmittedTitle")}</h2>
              <p className="text-[14px] mb-5" style={{ color: "rgba(5,5,8,0.5)" }}>{t("claimSubmittedDesc")}</p>
              <div className="rounded-xl px-4 py-3 mb-6" style={{ background: "rgba(0,4,232,0.05)", border: "1px solid rgba(0,4,232,0.12)" }}>
                <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "#0004E8" }}>{t("claimRefNumber")}</p>
                <p className="font-mono text-[13px] font-bold break-all" style={{ color: "#050508" }} dir="ltr">{claimId}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => router.push(`/claimant/claims/${claimId}`)}
                  className="flex-1 py-2.5 rounded-xl text-[14px] font-semibold text-white"
                  style={{ background: "#0004E8" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#2a2eed")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#0004E8")}>
                  {t("viewClaim")}
                </button>
                <button onClick={() => router.push("/claimant/claims")}
                  className="flex-1 py-2.5 rounded-xl text-[14px] font-semibold border"
                  style={{ borderColor: "#e2e2ee", color: "rgba(5,5,8,0.6)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f9f9fc")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  {t("myClaims")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
