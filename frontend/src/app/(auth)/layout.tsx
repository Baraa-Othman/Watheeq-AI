import Link from "next/link";
import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex flex-col lg:flex-row"
      style={{ background: "#fafafd" }}
    >
      {/* Left branded panel — desktop only */}
      <div
        className="hidden lg:flex lg:w-[440px] xl:w-[480px] flex-shrink-0 flex-col justify-between p-10 relative overflow-hidden"
        style={{ background: "#0004E8" }}
      >
        {/* Dot pattern */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.4) 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
        {/* Glow circles */}
        <div
          className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)" }}
        />
        <div
          className="absolute -bottom-32 -left-32 w-[400px] h-[400px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)" }}
        />

        {/* Logo */}
        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center gap-2">
            <Image src="/watheeq-logo.png" alt="Watheeq" width={130} height={34} className="brightness-0 invert" />
          </Link>
        </div>

        {/* Tagline */}
        <div className="relative z-10 space-y-6">
          <h2 className="text-[28px] font-bold text-white leading-snug">
            Smarter claims.
            <br />
            Faster decisions.
          </h2>
          <p className="text-white/55 text-[15px] leading-relaxed max-w-[320px]">
            AI reads your policies, matches clauses, and drafts responses — so examiners decide faster.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {["AI Analysis", "Policy Matching", "CHI Compliant"].map((t) => (
              <span
                key={t}
                className="px-3 py-1.5 rounded-full text-[11px] font-medium text-white/75 border border-white/15 bg-white/[0.06]"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-white/25 text-xs">
          &copy; {new Date().getFullYear()} Watheeq AI
        </p>
      </div>

      {/* Right content area */}
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="lg:hidden p-5">
          <Link href="/" className="inline-flex items-center gap-2">
            <Image src="/watheeq-logo.png" alt="Watheeq" width={110} height={30} />
          </Link>
        </header>
        <main className="flex-1 flex items-center justify-center px-5 py-6 lg:px-12">
          {children}
        </main>
        <footer className="py-3 text-center text-[11px] lg:hidden" style={{ color: "rgba(5,5,8,0.25)" }}>
          &copy; {new Date().getFullYear()} Watheeq AI
        </footer>
      </div>
    </div>
  );
}
