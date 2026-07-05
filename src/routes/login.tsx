import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import fujiHero from "@/assets/fuji-hero.jpg";
import logoEntGroup from "@/assets/LOGO_ENTGroup.png.asset.json";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [resetSent, setResetSent] = useState(false);

  if (!loading && user) return <Navigate to="/pipeline" />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setSubmitting(false);
    if (error) {
      toast.error(
        error.message.includes("Invalid login credentials")
          ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
          : error.message
      );
      return;
    }
    navigate({ to: "/pipeline" });
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { toast.error("กรุณากรอกอีเมลก่อน"); return; }
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/login`,
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    setResetSent(true);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">

      {/* ── LEFT: Fuji Hero ── */}
      <div className="relative hidden lg:flex flex-col overflow-hidden bg-sidebar">

        {/* Real Mt Fuji photo */}
        <img
          src={fujiHero}
          alt="ภูเขาไฟฟูจิยามพลบค่ำ พร้อมดอกซากุระและทะเลสาบสะท้อนเงา"
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Overlay gradient for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#050d1a] via-[#050d1a]/40 to-transparent" />


        {/* Hero text overlay */}
        <div className="relative z-10 flex h-full flex-col justify-between p-10">
          {/* Top badge */}
          <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs uppercase tracking-widest text-primary font-semibold backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            CRM
          </div>

          {/* Bottom headline */}
          <div className="space-y-4 max-w-sm">
            <h2 className="text-4xl font-bold leading-tight text-white">
              สร้างความสัมพันธ์<br />
              <span className="bg-gradient-to-r from-sky-400 to-cyan-300 bg-clip-text text-transparent">
                ที่ยั่งยืน
              </span>
            </h2>
            <p className="text-sm text-white/65 leading-relaxed">
              "มุ่งมั่นดูแลทุกความสัมพันธ์ด้วยหัวใจ<br />
              เสริมภาพลักษณ์ สร้างความไว้วางใจ<br />
              ก้าวไปพร้อมกันอย่างยั่งยืน"
            </p>
            <p className="text-[11px] uppercase tracking-[0.3em] text-white/35 font-medium">
              Relationships that last. Growth that endures.
            </p>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Login form ── */}
      <div className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-md space-y-8">

          {/* Logo + title */}
          <div className="text-center space-y-3">
            <img
              src={logoEntGroup.url}
              alt="ENTGROUP logo"
              className="mx-auto h-16 w-auto object-contain"
            />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">ระบบบริหารความสัมพันธ์ลูกค้าอัจฉริยะ</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "signin" ? "เข้าสู่ระบบ" : "รีเซ็ตรหัสผ่าน"}
              </p>
            </div>
          </div>

          {/* Form card */}
          <div className="rounded-2xl border bg-card p-8 shadow-sm space-y-5">
            {mode === "signin" ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm font-medium">อีเมล</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@entgroup.co.th"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-sm font-medium">รหัสผ่าน</Label>
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-xs text-primary hover:underline"
                    >
                      ลืมรหัสผ่าน?
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPw ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11 pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 text-sm font-semibold" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  เข้าสู่ระบบ
                </Button>
              </form>
            ) : resetSent ? (
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium">ส่งอีเมลแล้ว!</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    กรุณาตรวจสอบ <span className="text-primary">{email}</span><br />
                    และคลิกลิงก์เพื่อรีเซ็ตรหัสผ่าน (หมดอายุใน 1 ชม.)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setMode("signin"); setResetSent(false); }}
                  className="text-xs text-primary hover:underline"
                >
                  ← กลับไปเข้าสู่ระบบ
                </button>
              </div>
            ) : (
              <form onSubmit={handleReset} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="reset-email" className="text-sm font-medium">อีเมลที่ใช้สมัคร</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    required
                    placeholder="you@entgroup.co.th"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11"
                  />
                </div>
                <Button type="submit" className="w-full h-11 text-sm font-semibold" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  ส่งลิงก์รีเซ็ต
                </Button>
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className="w-full text-xs text-muted-foreground hover:text-foreground"
                >
                  ← กลับไปเข้าสู่ระบบ
                </button>
              </form>
            )}
          </div>

          <p className="text-center text-xs text-muted-foreground/80">
            ระบบบริหารความสัมพันธ์ลูกค้าอัจฉริยะ Version 1.0.20260706
          </p>
          <p className="text-center text-[11px] text-muted-foreground">
            © {new Date().getFullYear()} ENTGROUP Co., Ltd. · All rights reserved
          </p>
        </div>
      </div>
    </div>
  );
}
