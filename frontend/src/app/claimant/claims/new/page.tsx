"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { apiFetchAuth, API_BASE_URL } from "@/lib/apiClient";

interface Policy { id: string; policy_name: string; }

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[12px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "rgba(5,5,8,0.4)" }}>
      {children}
    </label>
  );
}

const inputClass = "w-full px-3.5 py-2.5 rounded-xl border text-[14px] outline-none transition-all focus:ring-[3px] focus:ring-blue-100";
const inputStyle = { borderColor: "#e8e8f0", color: "#050508" };
function formatBytes(b: number) { return `${(b / 1048576).toFixed(1)} MB`; }

// ── Reusable PDF upload zone ───────────────────────────────────────────────────
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
          (PDF, max 15 MB{!isRequired ? ", optional" : ""})
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
              <p className="text-[13px] font-semibold" style={{ color: "#15803d" }}>Uploaded successfully</p>
              {file && <p className="text-[11px] mt-0.5 truncate max-w-xs" style={{ color: "rgba(5,5,8,0.4)" }}>{file.name}</p>}
            </div>
            <button onClick={(e) => { e.stopPropagation(); reset(); }} className="text-[12px] font-medium" style={{ color: "#dc2626" }}>Remove</button>
          </>
        ) : file ? (
          <>
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(0,4,232,0.08)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0004E8" strokeWidth="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            </div>
            <div className="text-center">
              <p className="text-[13px] font-semibold truncate max-w-xs" style={{ color: "#050508" }}>{file.name}</p>
              <p className="text-[11px] mt-0.5" style={{ color: "rgba(5,5,8,0.4)" }}>{formatBytes(file.size)}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={(e) => { e.stopPropagation(); handleUpload(); }} disabled={uploading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white disabled:opacity-50"
                style={{ background: "#0004E8" }}>
                {uploading ? (<><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Uploading...</>) : "Upload"}
              </button>
              <button onClick={(e) => { e.stopPropagation(); reset(); }} className="px-3 py-2 rounded-lg text-[13px] font-medium border" style={{ borderColor: "#e8e8f0", color: "rgba(5,5,8,0.5)" }}>Change</button>
            </div>
          </>
        ) : (
          <>
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#f0f0f5" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(5,5,8,0.4)" strokeWidth="1.8"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            </div>
            <p className="text-[14px] font-medium" style={{ color: "#050508" }}>Click to select PDF</p>
            <p className="text-[12px]" style={{ color: "rgba(5,5,8,0.4)" }}>Maximum file size: 15 MB</p>
          </>
        )}
      </div>

      {fileError && <p className="text-[12px] mt-1.5" style={{ color: "#dc2626" }}>{fileError}</p>}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function NewClaimPage() {
  const { user } = useAuth();
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
        <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-[13px] font-medium mb-4 hover:opacity-70 transition-opacity" style={{ color: "rgba(5,5,8,0.45)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>Back
        </button>
        <h1 className="text-[26px] font-bold tracking-tight" style={{ color: "#050508" }}>Submit New Claim</h1>
        <p className="text-[14px] mt-0.5" style={{ color: "rgba(5,5,8,0.45)" }}>Fill in the details below to submit your insurance claim</p>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-5 px-4 py-3 rounded-xl text-sm flex items-center gap-2.5" style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="rounded-2xl border overflow-hidden" style={{ background: "#fff", borderColor: "#e8e8f0", boxShadow: "0 1px 3px rgba(5,5,8,0.03), 0 6px 24px rgba(5,5,8,0.04)" }}>
        {/* Patient section */}
        <div className="px-6 pt-6 pb-3 border-b" style={{ borderColor: "#f0f0f5" }}>
          <p className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: "#0004E8" }}>Patient Information</p>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div><FieldLabel>First Name *</FieldLabel><input className={inputClass} style={inputStyle} placeholder="e.g. Khalid" value={form.patientFName} onChange={setField("patientFName")} /></div>
            <div><FieldLabel>Last Name *</FieldLabel><input className={inputClass} style={inputStyle} placeholder="e.g. Al-Mansouri" value={form.patientLName} onChange={setField("patientLName")} /></div>
          </div>
          <div><FieldLabel>Date of Birth *</FieldLabel><input type="date" className={inputClass} style={inputStyle} value={form.patientDOB} onChange={setField("patientDOB")} /></div>
        </div>

        {/* Claim details section */}
        <div className="px-6 pb-3 border-t" style={{ borderColor: "#f0f0f5" }}>
          <p className="text-[12px] font-semibold uppercase tracking-widest pt-4" style={{ color: "#0004E8" }}>Claim Details</p>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <FieldLabel>Policy Plan *</FieldLabel>
            <select className={inputClass} style={{ ...inputStyle, background: "#fff" }} value={form.policyName} onChange={setField("policyName")} disabled={loadingPolicies}>
              <option value="">{loadingPolicies ? "Loading policies..." : "Select a policy plan"}</option>
              {policies.map((p) => <option key={p.id} value={p.policy_name}>{p.policy_name}</option>)}
            </select>
          </div>
          <div><FieldLabel>Treatment Type *</FieldLabel><input className={inputClass} style={inputStyle} placeholder="e.g. Physiotherapy, Surgery, Diagnostic Imaging" value={form.treatmentType} onChange={setField("treatmentType")} /></div>

          <UploadZone
            label="Medical Report *"
            isRequired={true}
            uploadedUrl={medUrl}
            onUploadComplete={setMedUrl}
            getToken={getToken}
            endpoint="/api/claims/upload-medical-report"
          />

          <UploadZone
            label="Supporting Documents"
            isRequired={false}
            uploadedUrl={docsUrl}
            onUploadComplete={setDocsUrl}
            getToken={getToken}
            endpoint="/api/claims/upload-supporting-docs"
          />
        </div>

        {/* Submit */}
        <div className="px-6 pb-6 pt-2">
          <button
            onClick={handleSubmit}
            disabled={submitting || !isValid}
            className="w-full py-3 rounded-xl text-[14px] font-semibold text-white transition-all disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ background: "#0004E8" }}
            onMouseEnter={(e) => { if (!submitting && isValid) (e.currentTarget as HTMLElement).style.background = "#2a2eed"; }}
            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "#0004E8"}
          >
            {submitting ? (<><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Submitting...</>) : "Submit Claim"}
          </button>
          {!medUrl && <p className="text-[11px] text-center mt-2" style={{ color: "rgba(5,5,8,0.35)" }}>Upload the medical report PDF to enable submission</p>}
        </div>
      </div>

      <div className="h-20 lg:h-0" />

      {/* Confirmation Modal */}
      <AnimatePresence>
        {claimId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center px-5" style={{ background: "rgba(5,5,8,0.45)" }}>
            <motion.div initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ type: "spring", stiffness: 320, damping: 26 }} className="rounded-2xl p-8 max-w-sm w-full text-center" style={{ background: "#fff", boxShadow: "0 24px 64px rgba(5,5,8,0.18)" }}>
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: "rgba(22,163,74,0.1)" }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M8 12.5l3 3 5-5.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <h2 className="text-[20px] font-bold mb-2" style={{ color: "#050508" }}>Claim Submitted!</h2>
              <p className="text-[14px] mb-5" style={{ color: "rgba(5,5,8,0.5)" }}>Your claim has been received. Use the reference number below to track its progress.</p>
              <div className="rounded-xl px-4 py-3 mb-6" style={{ background: "rgba(0,4,232,0.05)", border: "1px solid rgba(0,4,232,0.12)" }}>
                <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "#0004E8" }}>Claim Reference Number</p>
                <p className="font-mono text-[13px] font-bold break-all" style={{ color: "#050508" }}>{claimId}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => router.push(`/claimant/claims/${claimId}`)} className="flex-1 py-2.5 rounded-xl text-[14px] font-semibold text-white" style={{ background: "#0004E8" }} onMouseEnter={(e) => (e.currentTarget.style.background = "#2a2eed")} onMouseLeave={(e) => (e.currentTarget.style.background = "#0004E8")}>View Claim</button>
                <button onClick={() => router.push("/claimant/claims")} className="flex-1 py-2.5 rounded-xl text-[14px] font-semibold border" style={{ borderColor: "#e2e2ee", color: "rgba(5,5,8,0.6)" }} onMouseEnter={(e) => (e.currentTarget.style.background = "#f9f9fc")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>My Claims</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
