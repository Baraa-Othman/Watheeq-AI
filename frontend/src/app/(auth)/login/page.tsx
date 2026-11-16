"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";

export default function LoginPage() {
  const router = useRouter();
  const { signInWithToken } = useAuth();

  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [formattedPhone, setFormattedPhone] = useState("");

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (otpSent && otpRefs.current[0]) {
      otpRefs.current[0]?.focus();
    }
  }, [otpSent]);

  const formatPhone = (input: string) => {
    const digits = input.replace(/\D/g, "");
    if (digits.startsWith("966")) return `+${digits}`;
    if (digits.startsWith("05")) return `+966${digits.slice(1)}`;
    if (digits.startsWith("5")) return `+966${digits}`;
    return `+${digits}`;
  };

  const handleSendOtp = async () => {
    setError("");
    setLoading(true);
    try {
      const formatted = formatPhone(phone);
      const res = await apiFetch("/api/auth/send-otp", {
        method: "POST",
        body: JSON.stringify({ phone: formatted, context: "login" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "Failed to send OTP");
      setFormattedPhone(formatted);
      setOtpSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    if (digit && index < 3) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    const newOtp = [...otp];
    for (let i = 0; i < pasted.length; i++) newOtp[i] = pasted[i];
    setOtp(newOtp);
    otpRefs.current[Math.min(pasted.length, 3)]?.focus();
  };

  const otpValue = otp.join("");

  const handleVerify = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch("/api/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ phone: formattedPhone, otp: otpValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "Verification failed");

      if (data.is_new_user) {
        // Pass phone to register page via query param
        router.push(`/register?phone=${encodeURIComponent(formattedPhone)}`);
        return;
      }

      if (data.token) {
        const profile = await signInWithToken(data.token);
        router.push(`/dashboard/${profile.role}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = otpSent ? otpValue.length === 4 : phone.trim().length > 0;

  const handlePrimary = () => {
    if (otpSent) handleVerify();
    else handleSendOtp();
  };

  return (
    <div className="w-full max-w-[400px]">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <h1 className="text-[28px] font-bold tracking-tight mb-1.5" style={{ color: "#050508" }}>
          Sign in
        </h1>
        <p className="text-[14px] mb-7" style={{ color: "rgba(5,5,8,0.45)" }}>
          Enter your phone number to continue
        </p>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 px-4 py-3 rounded-xl text-sm flex items-center gap-2.5"
            style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </motion.div>
        )}

        <div
          className="rounded-2xl border overflow-hidden"
          style={{
            background: "#fff",
            borderColor: "#e8e8f0",
            boxShadow: "0 1px 3px rgba(5,5,8,0.03), 0 6px 24px rgba(5,5,8,0.04)",
          }}
        >
          {/* Phone field */}
          <div className="px-5 pt-5 pb-4">
            <label className="block text-[12px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(5,5,8,0.4)" }}>
              Phone number
            </label>
            <div
              className="flex items-center rounded-xl border overflow-hidden transition-all focus-within:ring-[3px]"
              style={{ borderColor: "#e8e8f0" }}
            >
              <span
                className="flex items-center justify-center w-[52px] h-[46px] text-[13px] font-medium flex-shrink-0 border-r"
                style={{ background: "#f8f8fc", borderColor: "#e8e8f0", color: "rgba(5,5,8,0.38)" }}
              >
                +966
              </span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (otpSent) { setOtpSent(false); setOtp(["", "", "", ""]); }
                }}
                onKeyDown={(e) => e.key === "Enter" && canSubmit && handlePrimary()}
                placeholder="5XXXXXXXX"
                className="flex-1 px-3 py-3 text-[14px] outline-none bg-transparent"
                style={{ color: "#050508" }}
                autoFocus
                disabled={loading && otpSent}
              />
              {otpSent && (
                <button
                  onClick={() => { setOtpSent(false); setOtp(["", "", "", ""]); setError(""); }}
                  className="px-3 text-[12px] font-medium"
                  style={{ color: "#0004E8" }}
                >
                  Edit
                </button>
              )}
            </div>
          </div>

          {/* OTP field */}
          {otpSent && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="px-5 pb-1">
                <div className="h-px w-full" style={{ background: "#f0f0f5" }} />
              </div>
              <div className="px-5 pt-3 pb-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: "rgba(5,5,8,0.4)" }}>
                    Verification code
                  </label>
                  <span className="text-[11px]" style={{ color: "rgba(5,5,8,0.35)" }}>
                    Sent to {formattedPhone}
                  </span>
                </div>
                <div className="flex gap-2 justify-center" onPaste={handleOtpPaste}>
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { otpRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      className="w-11 h-12 text-center text-[18px] font-bold rounded-lg border outline-none transition-all"
                      style={{ borderColor: digit ? "#0004E8" : "#e8e8f0", color: "#050508" }}
                    />
                  ))}
                </div>
                <button
                  onClick={() => { setOtp(["", "", "", ""]); handleSendOtp(); }}
                  className="mt-3 text-[12px] font-medium w-full text-center"
                  style={{ color: "rgba(5,5,8,0.35)" }}
                >
                  Didn&apos;t get it? <span style={{ color: "#0004E8" }}>Resend</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* Submit button */}
          <div className="px-5 pb-5 pt-1">
            <button
              onClick={handlePrimary}
              disabled={loading || !canSubmit}
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
                  {otpSent ? "Verifying..." : "Sending code..."}
                </>
              ) : otpSent ? (
                "Sign in"
              ) : (
                "Continue"
              )}
            </button>
          </div>
        </div>

        {/* Secondary links */}
        <div className="mt-5 flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: "#ebebf0" }} />
          <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "rgba(5,5,8,0.25)" }}>or</span>
          <div className="flex-1 h-px" style={{ background: "#ebebf0" }} />
        </div>

        <Link
          href="/admin-login"
          className="mt-4 flex items-center justify-center w-full py-2.5 rounded-xl border text-[13px] font-medium transition-all"
          style={{ borderColor: "#ebebf0", color: "rgba(5,5,8,0.5)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,4,232,0.03)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          Admin login
        </Link>

        <p className="mt-5 text-center text-[13px]" style={{ color: "rgba(5,5,8,0.38)" }}>
          No account?{" "}
          <Link href="/register" className="font-semibold" style={{ color: "#0004E8" }}>
            Create one
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
