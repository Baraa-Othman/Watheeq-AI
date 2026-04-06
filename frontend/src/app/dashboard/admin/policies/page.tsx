"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { apiFetchAuth, API_BASE_URL } from "@/lib/apiClient";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";

interface Policy {
  id: string;
  policy_name: string;
  file_url: string;
}

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
      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50"
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

function Spinner({ size = 6 }: { size?: number }) {
  return (
    <svg className={`animate-spin h-${size} w-${size}`} viewBox="0 0 24 24" style={{ color: "#0004E8" }}>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default function AdminPoliciesPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [fetching, setFetching] = useState(true);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [policyName, setPolicyName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = useState<Policy | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    if (profile && profile.role !== "admin") router.replace(`/dashboard/${profile.role}`);
  }, [user, profile, loading, router]);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchPolicies = useCallback(async () => {
    if (!user) return;
    setFetching(true);
    try {
      const res = await apiFetchAuth("/api/admin/policies", user);
      if (!res.ok) throw new Error("Failed to load policies");
      const data: Policy[] = await res.json();
      setPolicies(data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load", false);
    } finally {
      setFetching(false);
    }
  }, [user]);

  useEffect(() => {
    if (!loading && user && profile?.role === "admin") {
      fetchPolicies();
    }
  }, [loading, user, profile, fetchPolicies]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError("");
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      setUploadError("Only PDF files are accepted.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setUploadError("File must be under 10 MB.");
      return;
    }
    setFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !file || !policyName.trim()) return;
    setUploadError("");

    // Check name uniqueness first
    try {
      const checkRes = await apiFetchAuth(
        `/api/admin/policies/check-name?name=${encodeURIComponent(policyName.trim())}`,
        user
      );
      const checkData = await checkRes.json();
      if (checkData.exists) {
        setUploadError("A policy with this name already exists.");
        return;
      }
    } catch {
      setUploadError("Could not verify policy name. Please try again.");
      return;
    }

    setUploading(true);
    try {
      const idToken: string = await user.getIdToken();
      const formData = new FormData();
      formData.append("policy_name", policyName.trim());
      formData.append("file", file);

      const res = await fetch(`${API_BASE_URL}/api/admin/policies`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");

      setPolicies((prev) => [data, ...prev]);
      showToast("Policy uploaded successfully.", true);
      closeModal();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setPolicyName("");
    setFile(null);
    setUploadError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = async () => {
    if (!user || !deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetchAuth(`/api/admin/policies/${deleteTarget.id}`, user, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Delete failed");
      setPolicies((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      showToast("Policy deleted.", true);
      setDeleteTarget(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Delete failed", false);
    } finally {
      setDeleting(false);
    }
  };

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#fafafd" }}>
        <Spinner size={8} />
      </div>
    );
  }

  if (profile.role !== "admin") return null;

  return (
    <div className="min-h-screen" style={{ background: "#fafafd" }}>
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-lg flex items-center gap-2"
            style={{
              background: toast.ok ? "#f0fdf4" : "#fef2f2",
              color: toast.ok ? "#15803d" : "#dc2626",
              border: `1px solid ${toast.ok ? "#bbf7d0" : "#fecaca"}`,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              {toast.ok
                ? <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>
                : <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>
              }
            </svg>
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="h-16 border-b flex items-center justify-between px-6" style={{ borderColor: "#e2e2ee", background: "#fff" }}>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/admin">
            <Image src="/watheeq-logo.png" alt="Watheeq" width={110} height={30} />
          </Link>
          <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: "rgba(0,4,232,0.08)", color: "#0004E8" }}>
            Admin Panel
          </span>
        </div>
        <Link
          href="/dashboard/admin"
          className="text-sm font-medium px-4 py-2 rounded-lg border transition-all"
          style={{ borderColor: "#e2e2ee", color: "rgba(5,5,8,0.55)" }}
        >
          ← Dashboard
        </Link>
      </header>

      {/* Main */}
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#050508" }}>Policy Plans</h1>
            <p className="text-sm mt-1" style={{ color: "rgba(5,5,8,0.45)" }}>
              Upload and manage insurance policy plan documents.
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: "#0004E8" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Policy
          </button>
        </div>

        {/* Table */}
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#e2e2ee", background: "#fff", boxShadow: "0 1px 3px rgba(5,5,8,0.05)" }}>
          {fetching ? (
            <div className="flex items-center justify-center py-20"><Spinner size={7} /></div>
          ) : policies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(0,4,232,0.06)" }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0004E8" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <p className="font-semibold" style={{ color: "#050508" }}>No policies yet</p>
              <p className="text-sm mt-1" style={{ color: "rgba(5,5,8,0.4)" }}>Click "Add Policy" to upload the first one.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid #f0f0f5" }}>
                    {["Policy Name", "Actions"].map((h) => (
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
                        <span className="text-sm font-semibold" style={{ color: "#050508" }}>{policy.policy_name}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex gap-2">
                          <DownloadButton policyId={policy.id} policyName={policy.policy_name} user={user} />
                          <button
                            onClick={() => setDeleteTarget(policy)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
                            style={{ background: "rgba(239,68,68,0.08)", color: "#dc2626" }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6" /><path d="M14 11v6" />
                            </svg>
                            Delete
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Add Policy Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center px-4"
            style={{ background: "rgba(5,5,8,0.4)" }}
            onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              className="w-full max-w-md rounded-2xl p-6"
              style={{ background: "#fff", boxShadow: "0 20px 60px rgba(5,5,8,0.15)" }}
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold" style={{ color: "#050508" }}>Add Policy Plan</h2>
                <button onClick={closeModal} className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-gray-100">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "#050508" }}>Policy Name</label>
                  <input
                    type="text"
                    value={policyName}
                    onChange={(e) => setPolicyName(e.target.value)}
                    placeholder="e.g. Comprehensive Health Plan 2025"
                    required
                    className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition-all focus:border-blue-400"
                    style={{ borderColor: "#e2e2ee", color: "#050508" }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "#050508" }}>PDF File</label>
                  <div
                    className="w-full rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all hover:border-blue-300"
                    style={{ borderColor: file ? "#0004E8" : "#e2e2ee" }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {file ? (
                      <div className="flex items-center justify-center gap-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0004E8" strokeWidth="2" strokeLinecap="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <span className="text-sm font-medium" style={{ color: "#0004E8" }}>{file.name}</span>
                      </div>
                    ) : (
                      <>
                        <svg className="mx-auto mb-2" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(5,5,8,0.3)" strokeWidth="1.5" strokeLinecap="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        <p className="text-sm" style={{ color: "rgba(5,5,8,0.4)" }}>Click to select a PDF</p>
                        <p className="text-xs mt-1" style={{ color: "rgba(5,5,8,0.3)" }}>Max 10 MB</p>
                      </>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>

                {uploadError && (
                  <p className="text-sm font-medium" style={{ color: "#dc2626" }}>{uploadError}</p>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all hover:bg-gray-50"
                    style={{ borderColor: "#e2e2ee", color: "rgba(5,5,8,0.6)" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploading || !policyName.trim() || !file}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ background: "#0004E8" }}
                  >
                    {uploading ? <><Spinner size={4} /> Uploading…</> : "Upload Policy"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center px-4"
            style={{ background: "rgba(5,5,8,0.4)" }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              className="w-full max-w-sm rounded-2xl p-6"
              style={{ background: "#fff", boxShadow: "0 20px 60px rgba(5,5,8,0.15)" }}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(239,68,68,0.08)" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.75" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" /><path d="M14 11v6" />
                </svg>
              </div>
              <h2 className="text-base font-bold text-center mb-1" style={{ color: "#050508" }}>Delete Policy</h2>
              <p className="text-sm text-center mb-5" style={{ color: "rgba(5,5,8,0.5)" }}>
                Are you sure you want to delete <strong style={{ color: "#050508" }}>{deleteTarget.policy_name}</strong>? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all hover:bg-gray-50 disabled:opacity-50"
                  style={{ borderColor: "#e2e2ee", color: "rgba(5,5,8,0.6)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: "#dc2626" }}
                >
                  {deleting ? <><Spinner size={4} /> Deleting…</> : "Delete"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
