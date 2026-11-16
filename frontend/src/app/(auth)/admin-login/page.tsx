"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const { signInAdmin } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const profile = await signInAdmin(email, password);
      router.push(`/dashboard/${profile.role}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed";
      if (msg.includes("invalid-credential") || msg.includes("wrong-password")) {
        setError("Invalid email or password");
      } else if (msg.includes("user-not-found")) {
        setError("No admin account with this email");
      } else if (msg.includes("too-many-requests")) {
        setError("Too many attempts. Try again later.");
      } else if (msg.includes("permission") || msg.includes("insufficient")) {
        setError("Database access denied. Deploy Firestore rules.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[400px]">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(0,4,232,0.08)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0004E8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div>
            <h1 className="text-[20px] font-bold tracking-tight" style={{ color: "#050508" }}>Admin Portal</h1>
          </div>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 px-4 py-3 rounded-xl text-sm flex items-center gap-2.5"
            style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </motion.div>
        )}

        <form onSubmit={handleSubmit}>
          <div
            className="rounded-2xl border overflow-hidden"
            style={{
              background: "#fff",
              borderColor: "#e8e8f0",
              boxShadow: "0 1px 3px rgba(5,5,8,0.03), 0 6px 24px rgba(5,5,8,0.04)",
            }}
          >
            <div className="px-5 pt-5 pb-4 space-y-3.5">
              <div>
                <label className="block text-[12px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "rgba(5,5,8,0.4)" }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@watheeq.ai"
                  className="w-full px-3.5 py-2.5 rounded-lg border text-[14px] outline-none transition-all"
                  style={{ borderColor: "#e8e8f0", color: "#050508" }}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "rgba(5,5,8,0.4)" }}>
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full px-3.5 py-2.5 pr-10 rounded-lg border text-[14px] outline-none transition-all"
                    style={{ borderColor: "#e8e8f0", color: "#050508" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: "rgba(5,5,8,0.3)" }}
                    tabIndex={-1}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {showPw ? (
                        <>
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </>
                      ) : (
                        <>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="px-5 pb-5 pt-1">
              <button
                type="submit"
                disabled={loading || !email.trim() || !password.trim()}
                className="w-full py-3 rounded-xl text-[14px] font-semibold text-white transition-all disabled:opacity-35 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ background: "#0004E8" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#2a2eed")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#0004E8")}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </button>
            </div>
          </div>
        </form>

        <div className="mt-5 flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: "#ebebf0" }} />
          <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "rgba(5,5,8,0.25)" }}>or</span>
          <div className="flex-1 h-px" style={{ background: "#ebebf0" }} />
        </div>

        <Link
          href="/login"
          className="mt-4 flex items-center justify-center w-full py-2.5 rounded-xl border text-[13px] font-medium transition-all"
          style={{ borderColor: "#ebebf0", color: "rgba(5,5,8,0.5)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,4,232,0.03)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          Claimant / Examiner login
        </Link>
      </motion.div>
    </div>
  );
}
