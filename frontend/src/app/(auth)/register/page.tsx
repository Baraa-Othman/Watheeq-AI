"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";

type Role = "claimant" | "examiner";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signInWithToken } = useAuth();

  const phoneFromQuery = searchParams.get("phone") ?? "";

  const [role, setRole] = useState<Role>("claimant");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState(phoneFromQuery);
  const [nationalId, setNationalId] = useState("");
  const [email, setEmail] = useState("");
  const [hospitalName, setHospitalName] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [formattedPhone, setFormattedPhone] = useState(phoneFromQuery);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (otpSent && otpRefs.current[0]) otpRefs.current[0]?.focus();
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
        body: JSON.stringify({
          phone: formatted,
          context: role === "examiner" ? "examiner_register" : "register",
          national_id: nationalId || undefined,
          email: email || undefined,
        }),
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
    if (digit && index < 3) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
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

  // ── Claimant flow ────────────────────────────────────────────────────────
  const handleClaimantVerifyAndRegister = async () => {
    setError("");
    setLoading(true);
    try {
      // 1. Verify OTP
      const verifyRes = await apiFetch("/api/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ phone: formattedPhone, otp: otpValue }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.detail || verifyData.error || "OTP verification failed");

      // If already exists (shouldn't happen here but handle gracefully)
      if (!verifyData.is_new_user && verifyData.token) {
        const profile = await signInWithToken(verifyData.token);
        router.push(`/dashboard/${profile.role}`);
        return;
      }

      // 2. Create claimant account
      const regRes = await apiFetch("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          phone: formattedPhone,
          full_name: fullName,
          role: "claimant",
          national_id: nationalId || undefined,
          email: email || undefined,
          hospital_name: hospitalName || undefined,
        }),
      });
      const regData = await regRes.json();
      if (!regRes.ok) throw new Error(regData.detail || regData.error || "Registration failed");

      if (regData.token) {
        const profile = await signInWithToken(regData.token);
        router.push(`/dashboard/${profile.role}`);
      } else {
        setSuccessMessage(regData.message || "Account created.");
        setSuccess(true);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  // ── Examiner flow ─────────────────────────────────────────────────────────
  const handleExaminerVerifyAndRegister = async () => {
    setError("");
    setLoading(true);
    try {
      // 1. Verify OTP (just to confirm phone ownership — no user account yet)
      const verifyRes = await apiFetch("/api/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ phone: formattedPhone, otp: otpValue }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.detail || verifyData.error || "OTP verification failed");

      // 2. Submit registration request
      const reqRes = await apiFetch("/api/auth/examiner/register", {
        method: "POST",
        body: JSON.stringify({
          phone: formattedPhone,
          full_name: fullName,
          national_id: nationalId,
          email: email,
        }),
      });
      const reqData = await reqRes.json();
      if (!reqRes.ok) throw new Error(reqData.detail || reqData.error || "Submission failed");

      setSuccessMessage(reqData.message);
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndSubmit = () => {
    if (role === "examiner") handleExaminerVerifyAndRegister();
    else handleClaimantVerifyAndRegister();
  };

  // Validation
  const claimantReady = role === "claimant"
    ? Boolean(fullName.trim() && nationalId.trim() && email.trim() && hospitalName.trim() && phone.trim())
    : true;
  const examinerReady = role === "examiner"
    ? Boolean(fullName.trim() && nationalId.trim() && email.trim() && phone.trim())
    : true;
  const detailsFilled = claimantReady && examinerReady;
  const canSubmit = otpSent ? otpValue.length === 4 : detailsFilled;

  const handlePrimary = () => {
    if (otpSent) handleVerifyAndSubmit();
    else handleSendOtp();
  };

  // ── Success screen ────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="w-full max-w-[400px]">
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
            style={{ background: "rgba(0,4,232,0.08)" }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0004E8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: "#050508" }}>
            {role === "examiner" ? "Request Submitted" : "You're all set!"}
          </h2>
          <p className="text-[13px] mb-6 leading-relaxed" style={{ color: "rgba(5,5,8,0.45)" }}>
            {successMessage || "Your request has been received."}
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white"
            style={{ background: "#0004E8" }}
          >
            Go to Sign In
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </motion.div>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-[400px]">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <h1 className="text-[28px] font-bold tracking-tight mb-1.5" style={{ color: "#050508" }}>
          Create account
        </h1>
        <p className="text-[14px] mb-7" style={{ color: "rgba(5,5,8,0.45)" }}>
          {role === "examiner"
            ? "Submit a registration request as a Claims Examiner"
            : "Join Watheeq as a claimant"}
        </p>

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

        <div
          className="rounded-2xl border overflow-hidden"
          style={{ background: "#fff", borderColor: "#e8e8f0", boxShadow: "0 1px 3px rgba(5,5,8,0.03), 0 6px 24px rgba(5,5,8,0.04)" }}
        >
          {/* Role selector */}
          <div className="px-5 pt-5 pb-3">
            <label className="block text-[12px] font-semibold uppercase tracking-widest mb-2.5" style={{ color: "rgba(5,5,8,0.4)" }}>
              I am a
            </label>
            <div className="flex gap-2">
              {([
                { id: "claimant" as Role, label: "Claimant" },
                { id: "examiner" as Role, label: "Claims Examiner" },
              ]).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => { setRole(opt.id); if (otpSent) { setOtpSent(false); setOtp(["", "", "", ""]); setError(""); } }}
                  className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold transition-all border"
                  style={{
                    background: role === opt.id ? "#0004E8" : "transparent",
                    color: role === opt.id ? "#fff" : "rgba(5,5,8,0.5)",
                    borderColor: role === opt.id ? "#0004E8" : "#e8e8f0",
                  }}
                  disabled={otpSent}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Examiner info banner */}
          {role === "examiner" && !otpSent && (
            <div className="mx-5 mb-1 px-3.5 py-2.5 rounded-lg text-[12px] leading-relaxed" style={{ background: "rgba(0,4,232,0.05)", color: "rgba(5,5,8,0.55)" }}>
              Your request will be reviewed by an admin before your account is activated.
            </div>
          )}

          <div className="px-5"><div className="h-px" style={{ background: "#f0f0f5" }} /></div>

          {/* Form fields */}
          <div className="px-5 py-4 space-y-3.5">

            {/* Full name — both roles */}
            <div>
              <label className="block text-[12px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "rgba(5,5,8,0.4)" }}>
                Full name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Mohammed Al-Qahtani"
                className="w-full px-3.5 py-2.5 rounded-lg border text-[14px] outline-none transition-all"
                style={{ borderColor: "#e8e8f0", color: "#050508" }}
                disabled={otpSent}
              />
            </div>

            {/* National ID / Iqama — both roles */}
            <div>
              <label className="block text-[12px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "rgba(5,5,8,0.4)" }}>
                National ID or Iqama number
              </label>
              <input
                type="text"
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
                placeholder="10-digit National ID or Iqama"
                className="w-full px-3.5 py-2.5 rounded-lg border text-[14px] outline-none transition-all"
                style={{ borderColor: "#e8e8f0", color: "#050508" }}
                disabled={otpSent}
              />
            </div>

            {/* Email — both roles */}
            <div>
              <label className="block text-[12px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "rgba(5,5,8,0.4)" }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 rounded-lg border text-[14px] outline-none transition-all"
                style={{ borderColor: "#e8e8f0", color: "#050508" }}
                disabled={otpSent}
              />
            </div>

            {/* Hospital name — claimant only */}
            {role === "claimant" && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="overflow-hidden">
                <label className="block text-[12px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "rgba(5,5,8,0.4)" }}>
                  Hospital name
                </label>
                <input
                  type="text"
                  value={hospitalName}
                  onChange={(e) => setHospitalName(e.target.value)}
                  placeholder="e.g. King Fahad Medical City"
                  className="w-full px-3.5 py-2.5 rounded-lg border text-[14px] outline-none transition-all"
                  style={{ borderColor: "#e8e8f0", color: "#050508" }}
                  disabled={otpSent}
                />
              </motion.div>
            )}

            {/* Phone — both roles */}
            <div>
              <label className="block text-[12px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "rgba(5,5,8,0.4)" }}>
                Phone number
              </label>
              <div className="flex items-center rounded-lg border overflow-hidden transition-all" style={{ borderColor: "#e8e8f0" }}>
                <span className="flex items-center justify-center w-[52px] h-[42px] text-[13px] font-medium flex-shrink-0 border-r" style={{ background: "#f8f8fc", borderColor: "#e8e8f0", color: "rgba(5,5,8,0.38)" }}>
                  +966
                </span>
                <input
                  type="tel"
                  value={phone.replace(/^\+966/, "")}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (otpSent) { setOtpSent(false); setOtp(["", "", "", ""]); }
                  }}
                  placeholder="5XXXXXXXX"
                  className="flex-1 px-3 py-2.5 text-[14px] outline-none bg-transparent"
                  style={{ color: "#050508" }}
                  disabled={otpSent}
                />
              </div>
            </div>
          </div>

          {/* OTP section */}
          {otpSent && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} transition={{ duration: 0.3 }} className="overflow-hidden">
              <div className="px-5"><div className="h-px" style={{ background: "#f0f0f5" }} /></div>
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: "rgba(5,5,8,0.4)" }}>
                    Verification code
                  </label>
                  <span className="text-[11px]" style={{ color: "rgba(5,5,8,0.3)" }}>
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

          {/* Submit */}
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
                  {otpSent ? (role === "examiner" ? "Submitting request..." : "Creating account...") : "Sending code..."}
                </>
              ) : otpSent ? (
                role === "examiner" ? "Submit Request" : "Create Account"
              ) : (
                "Continue"
              )}
            </button>
          </div>
        </div>

        <p className="mt-5 text-center text-[13px]" style={{ color: "rgba(5,5,8,0.38)" }}>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold" style={{ color: "#0004E8" }}>
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="w-full max-w-[400px] flex items-center justify-center py-20">
        <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" style={{ color: "#0004E8" }}>
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    }>
      <RegisterForm />
    </Suspense>
  );
}
