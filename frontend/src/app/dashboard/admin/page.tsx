"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { apiFetchAuth } from "@/lib/apiClient";
import Link from "next/link";

export default function AdminDashboard() {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    if (profile && profile.role !== "admin") router.replace(`/dashboard/${profile.role}`);
  }, [user, profile, loading, router]);

  const fetchPendingCount = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiFetchAuth("/api/admin/examiner-requests?status=pending", user);
      if (res.ok) {
        const data = await res.json();
        setPendingCount(Array.isArray(data) ? data.length : 0);
      }
    } catch {
      // non-fatal
    }
  }, [user]);

  useEffect(() => {
    if (!loading && user && profile?.role === "admin") {
      const t = setTimeout(fetchPendingCount, 200);
      return () => clearTimeout(t);
    }
  }, [loading, user, profile, fetchPendingCount]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#fafafd" }}>
        <svg className="animate-spin h-8 w-8" viewBox="0 0 24 24" style={{ color: "#0004E8" }}>
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (!user || !profile || profile.role !== "admin") return null;

  return (
    <div className="min-h-screen" style={{ background: "#fafafd" }}>
      {/* Header */}
      <header className="h-16 border-b flex items-center justify-between px-6" style={{ borderColor: "#e2e2ee", background: "#fff" }}>
        <div className="flex items-center gap-3">
          <span className="font-bold text-lg tracking-tight" style={{ color: "#050508" }}>Watheeq AI</span>
          <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: "rgba(0,4,232,0.08)", color: "#0004E8" }}>
            Admin Panel
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium" style={{ color: "#050508" }}>{profile.fullName}</span>
          <button
            onClick={async () => { await signOut(); router.push("/login"); }}
            className="text-sm font-medium px-4 py-2 rounded-lg border transition-all hover:bg-red-50 hover:border-red-200 hover:text-red-600"
            style={{ borderColor: "#e2e2ee", color: "rgba(5,5,8,0.55)" }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-5xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2" style={{ color: "#050508" }}>
          Welcome, {profile.fullName}
        </h1>
        <p className="text-sm mb-8" style={{ color: "rgba(5,5,8,0.55)" }}>
          Manage examiners, policies, and monitor system activity.
        </p>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Examiner Requests card */}
          <Link
            href="/dashboard/admin/requests"
            className="group rounded-2xl border p-6 transition-all hover:shadow-md hover:border-blue-200"
            style={{ borderColor: "#e2e2ee", background: "#fff", boxShadow: "0 1px 3px rgba(5,5,8,0.05)" }}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "rgba(0,4,232,0.08)" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0004E8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              {pendingCount !== null && pendingCount > 0 && (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: "rgba(234,179,8,0.15)", color: "#b45309" }}>
                  {pendingCount} pending
                </span>
              )}
            </div>
            <h3 className="font-bold text-base mb-1 group-hover:text-blue-700 transition-colors" style={{ color: "#050508" }}>
              Examiner Requests
            </h3>
            <p className="text-sm" style={{ color: "rgba(5,5,8,0.45)" }}>
              Review, approve, or reject Claims Examiner registration requests.
            </p>
          </Link>

          {/* Placeholder for future cards */}
          <div
            className="rounded-2xl border p-6 opacity-50"
            style={{ borderColor: "#e2e2ee", background: "#fff", boxShadow: "0 1px 3px rgba(5,5,8,0.05)" }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: "#f0f0f5" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(5,5,8,0.3)" strokeWidth="1.75" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <h3 className="font-bold text-base mb-1" style={{ color: "#050508" }}>Claims Management</h3>
            <p className="text-sm" style={{ color: "rgba(5,5,8,0.45)" }}>Coming soon.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
