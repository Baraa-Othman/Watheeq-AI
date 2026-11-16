"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { apiFetchAuth } from "@/lib/apiClient";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";

type Status = "pending" | "approved" | "rejected";

interface ExaminerRequest {
  id: string;
  full_name: string;
  national_id: string;
  email: string;
  phone: string;
  status: Status;
  created_at: string;
  reviewed_at: string | null;
}

const STATUS_STYLES: Record<Status, { bg: string; text: string; label: string }> = {
  pending: { bg: "rgba(234,179,8,0.1)", text: "#b45309", label: "Pending" },
  approved: { bg: "rgba(34,197,94,0.1)", text: "#15803d", label: "Approved" },
  rejected: { bg: "rgba(239,68,68,0.1)", text: "#dc2626", label: "Rejected" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-SA", { year: "numeric", month: "short", day: "numeric" });
}

export default function ExaminerRequestsPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  const [requests, setRequests] = useState<ExaminerRequest[]>([]);
  const [filter, setFilter] = useState<"all" | Status>("pending");
  const [fetching, setFetching] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Auth guard
  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    if (profile && profile.role !== "admin") router.replace(`/dashboard/${profile.role}`);
  }, [user, profile, loading, router]);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchRequests = useCallback(async (isRetry = false) => {
    if (!user) return;
    if (!isRetry) setFetching(true);
    try {
      const params = filter !== "all" ? `?status=${filter}` : "";
      const res = await apiFetchAuth(`/api/admin/examiner-requests${params}`, user);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Server error ${res.status}`);
      }
      const data: ExaminerRequest[] = await res.json();
      setRequests(data);
      setFetching(false);
    } catch (e) {
      if (!isRetry) {
        // First failure — silently retry once after 800ms
        setTimeout(() => fetchRequests(true), 800);
      } else {
        console.error("[ExaminerRequests] fetch error:", e);
        showToast(e instanceof Error ? e.message : "Failed to load", false);
        setFetching(false);
      }
    }
  }, [user, filter]);

  useEffect(() => {
    if (!loading && user && profile?.role === "admin") {
      const t = setTimeout(fetchRequests, 200);
      return () => clearTimeout(t);
    }
  }, [loading, user, profile, fetchRequests]);

  const handleAction = async (requestId: string, action: "approve" | "reject") => {
    if (!user) return;
    setActionLoading(requestId + action);
    try {
      const res = await apiFetchAuth(
        `/api/admin/examiner-requests/${requestId}/${action}`,
        user,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Action failed");

      // Update row in-place
      setRequests((prev) =>
        prev.map((r) =>
          r.id === requestId
            ? { ...r, status: action === "approve" ? "approved" : "rejected", reviewed_at: new Date().toISOString() }
            : r
        )
      );
      showToast(action === "approve" ? "Examiner approved and notified." : "Request rejected.", true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Action failed", false);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#fafafd" }}>
        <svg className="animate-spin h-8 w-8" viewBox="0 0 24 24" style={{ color: "#0004E8" }}>
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (profile.role !== "admin") return null;

  const pendingCount = requests.filter((r) => r.status === "pending").length;

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
      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#050508" }}>
              Examiner Requests
              {pendingCount > 0 && filter !== "approved" && filter !== "rejected" && (
                <span className="ml-3 px-2.5 py-0.5 rounded-full text-sm font-semibold" style={{ background: "rgba(234,179,8,0.15)", color: "#b45309" }}>
                  {pendingCount} pending
                </span>
              )}
            </h1>
            <p className="text-sm mt-1" style={{ color: "rgba(5,5,8,0.45)" }}>
              Review and manage Claims Examiner registration requests
            </p>
          </div>
          <button
            onClick={() => fetchRequests()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all"
            style={{ borderColor: "#e2e2ee", color: "rgba(5,5,8,0.55)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Refresh
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: "#f0f0f5" }}>
          {(["pending", "all", "approved", "rejected"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all capitalize"
              style={
                filter === f
                  ? { background: "#fff", color: "#050508", boxShadow: "0 1px 3px rgba(5,5,8,0.08)" }
                  : { color: "rgba(5,5,8,0.45)" }
              }
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#e2e2ee", background: "#fff", boxShadow: "0 1px 3px rgba(5,5,8,0.05)" }}>
          {fetching ? (
            <div className="flex items-center justify-center py-20">
              <svg className="animate-spin h-7 w-7" viewBox="0 0 24 24" style={{ color: "#0004E8" }}>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(0,4,232,0.06)" }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0004E8" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <p className="font-semibold" style={{ color: "#050508" }}>No requests found</p>
              <p className="text-sm mt-1" style={{ color: "rgba(5,5,8,0.4)" }}>
                {filter === "pending" ? "No pending requests at this time." : `No ${filter} requests.`}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid #f0f0f5" }}>
                    {["Full Name", "National ID / Iqama", "Email", "Phone", "Submitted", "Status", "Actions"].map((h) => (
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
                  {requests.map((req, i) => (
                    <motion.tr
                      key={req.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      style={{ borderBottom: "1px solid #f5f5f8" }}
                    >
                      <td className="px-5 py-4">
                        <span className="text-sm font-semibold" style={{ color: "#050508" }}>{req.full_name}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-sm font-mono" style={{ color: "rgba(5,5,8,0.65)" }}>{req.national_id}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-sm" style={{ color: "rgba(5,5,8,0.65)" }}>{req.email}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-sm font-mono" style={{ color: "rgba(5,5,8,0.65)" }}>{req.phone}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-sm" style={{ color: "rgba(5,5,8,0.5)" }}>{formatDate(req.created_at)}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold capitalize"
                          style={{
                            background: STATUS_STYLES[req.status].bg,
                            color: STATUS_STYLES[req.status].text,
                          }}
                        >
                          {STATUS_STYLES[req.status].label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {req.status === "pending" ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAction(req.id, "approve")}
                              disabled={actionLoading !== null}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 flex items-center gap-1.5"
                              style={{ background: "rgba(34,197,94,0.1)", color: "#15803d" }}
                            >
                              {actionLoading === req.id + "approve" ? (
                                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                              ) : (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                              Approve
                            </button>
                            <button
                              onClick={() => handleAction(req.id, "reject")}
                              disabled={actionLoading !== null}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 flex items-center gap-1.5"
                              style={{ background: "rgba(239,68,68,0.08)", color: "#dc2626" }}
                            >
                              {actionLoading === req.id + "reject" ? (
                                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                              ) : (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                              )}
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs" style={{ color: "rgba(5,5,8,0.3)" }}>
                            {req.reviewed_at ? formatDate(req.reviewed_at) : "—"}
                          </span>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
