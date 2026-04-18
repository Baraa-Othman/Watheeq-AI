"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiFetchAuth } from "@/lib/apiClient";
import { motion } from "framer-motion";
import { PDFPreviewModal } from "@/components/PDFPreviewModal";

interface Policy {
  id: string;
  policy_name: string;
  file_url: string;
}

function Spinner({ size = 6 }: { size?: number }) {
  return (
    <svg className={`animate-spin h-${size} w-${size}`} viewBox="0 0 24 24" style={{ color: "#0004E8" }}>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DownloadButton({ policyId, policyName, user }: { policyId: string; policyName: string; user: any }) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const res = await apiFetchAuth(`/api/policies/${policyId}/download`, user);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${policyName}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Download failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50"
      style={{ background: "rgba(0,4,232,0.08)", color: "#0004E8" }}
    >
      {loading ? <Spinner size={3} /> : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      )}
      Download
    </button>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PreviewButton({ policyId, policyName, user }: { policyId: string; policyName: string; user: any }) {
  const [loading, setLoading] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const handlePreview = async () => {
    setOpen(true);
    if (blobUrl) return;
    setLoading(true);
    try {
      const res = await apiFetchAuth(`/api/policies/${policyId}/download`, user);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Preview failed");
      }
      const blob = await res.blob();
      setBlobUrl(URL.createObjectURL(blob));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Preview failed");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handlePreview}
        disabled={loading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50"
        style={{ background: "rgba(0,4,232,0.06)", color: "#0004E8", border: "1px solid rgba(0,4,232,0.15)" }}
      >
        {loading ? <Spinner size={3} /> : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
        Preview
      </button>
      {open && (
        <PDFPreviewModal
          policyName={policyName}
          blobUrl={blobUrl}
          loading={loading}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export default function ClaimantPoliciesPage() {
  const { user } = useAuth();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");

  const fetchPolicies = useCallback(async () => {
    if (!user) return;
    setFetching(true);
    try {
      const res = await apiFetchAuth("/api/policies", user);
      if (!res.ok) throw new Error("Failed to load policies");
      const data: Policy[] = await res.json();
      setPolicies(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load policies");
    } finally {
      setFetching(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-tight" style={{ color: "#050508" }}>
          Policy Plans
        </h1>
        <p className="text-[14px] mt-0.5" style={{ color: "rgba(5,5,8,0.45)" }}>
          Browse and download available insurance policy plan documents
        </p>
      </div>

      {fetching ? (
        <div className="flex items-center justify-center py-20"><Spinner size={7} /></div>
      ) : error ? (
        <div className="rounded-2xl border p-8 text-center" style={{ borderColor: "#fecaca", background: "#fef2f2" }}>
          <p className="text-sm font-medium" style={{ color: "#dc2626" }}>{error}</p>
          <button onClick={fetchPolicies} className="mt-3 text-sm underline" style={{ color: "#dc2626" }}>Try again</button>
        </div>
      ) : policies.length === 0 ? (
        <div className="rounded-2xl border p-16 text-center" style={{ borderColor: "#e2e2ee", background: "#fff", boxShadow: "0 1px 3px rgba(5,5,8,0.05)" }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(0,4,232,0.06)" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0004E8" strokeWidth="1.5" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <p className="font-semibold" style={{ color: "#050508" }}>No policies available</p>
          <p className="text-sm mt-1" style={{ color: "rgba(5,5,8,0.4)" }}>Check back later.</p>
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#e2e2ee", background: "#fff", boxShadow: "0 1px 3px rgba(5,5,8,0.05)" }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid #f0f0f5" }}>
                  {["Policy Name", "Action"].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-widest"
                      style={{ color: "rgba(5,5,8,0.38)", background: "#fafafd" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {policies.map((policy, i) => (
                  <motion.tr
                    key={policy.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    style={{ borderBottom: "1px solid #f5f5f8" }}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(0,4,232,0.06)" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0004E8" strokeWidth="2" strokeLinecap="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                        </div>
                        <span className="text-sm font-semibold" style={{ color: "#050508" }}>{policy.policy_name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        <PreviewButton policyId={policy.id} policyName={policy.policy_name} user={user} />
                        <DownloadButton policyId={policy.id} policyName={policy.policy_name} user={user} />
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bottom padding for mobile nav */}
      <div className="h-20 lg:h-0" />
    </div>
  );
}
