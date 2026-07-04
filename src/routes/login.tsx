import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

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

        {/* Fuji SVG illustration */}
        <svg
          viewBox="0 0 800 600"
          xmlns="http://www.w3.org/2000/svg"
          className="absolute inset-0 w-full h-full object-cover"
          preserveAspectRatio="xMidYMid slice"
        >
          {/* Sky gradient */}
          <defs>
            <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0a1628" />
              <stop offset="40%" stopColor="#0d2244" />
              <stop offset="100%" stopColor="#1a3a5c" />
            </linearGradient>
            <linearGradient id="fuji" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e8eef5" />
              <stop offset="30%" stopColor="#c8d8e8" />
              <stop offset="100%" stopColor="#4a6fa5" />
            </linearGradient>
            <linearGradient id="lake" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1a3a5c" />
              <stop offset="100%" stopColor="#0d2244" />
            </linearGradient>
            <linearGradient id="snow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#e0eaf4" />
            </linearGradient>
            <radialGradient id="moon" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fff8e1" />
              <stop offset="100%" stopColor="#ffd54f" />
            </radialGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Sky */}
          <rect width="800" height="600" fill="url(#sky)" />

          {/* Stars */}
          {[
            [80,40],[150,80],[220,30],[300,60],[380,25],[450,70],[520,35],[600,55],[680,20],[720,80],
            [100,120],[200,100],[320,90],[440,110],[560,85],[660,100],[760,40],[50,150],[170,160],
            [340,140],[480,130],[620,145],[740,120],[90,200],[250,180],[410,195],[570,170],[730,185],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={Math.random() > 0.7 ? 1.5 : 1} fill="white" opacity={0.6 + Math.random() * 0.4} />
          ))}

          {/* Moon */}
          <circle cx="650" cy="90" r="28" fill="url(#moon)" filter="url(#glow)" opacity="0.95" />
          <circle cx="660" cy="85" r="24" fill="#0d2244" opacity="0.15" />

          {/* Moon reflection on lake */}
          <ellipse cx="650" cy="490" rx="18" ry="6" fill="#ffd54f" opacity="0.3" />

          {/* Distant mountains (dark silhouette) */}
          <path d="M0,380 Q100,300 200,320 Q300,290 400,340 Q500,300 600,330 Q700,290 800,320 L800,420 L0,420 Z"
            fill="#0d1e35" opacity="0.8" />

          {/* Mt Fuji — main */}
          <path d="M400,80 L570,380 L230,380 Z" fill="url(#fuji)" />

          {/* Fuji snow cap */}
          <path d="M400,80 L445,180 Q420,200 400,195 Q380,200 355,180 Z" fill="url(#snow)" opacity="0.95" />
          {/* Snow detail lines */}
          <path d="M400,80 L430,160 Q415,175 400,170 Q385,175 370,160 Z" fill="white" opacity="0.6" />

          {/* Fuji ridge shading */}
          <path d="M400,80 L570,380 Q490,360 440,300 Q410,240 400,80"
            fill="#2a4a7a" opacity="0.3" />

          {/* Foreground hills */}
          <path d="M0,360 Q80,310 160,340 Q220,320 280,350 Q340,330 400,360 L400,420 L0,420 Z"
            fill="#0a1628" opacity="0.9" />
          <path d="M400,360 Q460,330 520,355 Q580,335 650,360 Q720,340 800,365 L800,420 L400,420 Z"
            fill="#0a1628" opacity="0.9" />

          {/* Lake */}
          <ellipse cx="400" cy="460" rx="320" ry="60" fill="url(#lake)" opacity="0.85" />

          {/* Lake reflection of Fuji */}
          <path d="M400,420 L340,500 L460,500 Z" fill="#1a3a5c" opacity="0.5" />
          <ellipse cx="400" cy="500" rx="60" ry="8" fill="#4a6fa5" opacity="0.25" />

          {/* Sakura trees left */}
          <rect x="120" y="350" width="6" height="50" fill="#2d1b0e" />
          <ellipse cx="123" cy="345" rx="22" ry="18" fill="#c2185b" opacity="0.75" />
          <ellipse cx="110" cy="355" rx="14" ry="12" fill="#e91e63" opacity="0.6" />
          <ellipse cx="138" cy="352" rx="14" ry="12" fill="#f06292" opacity="0.6" />

          <rect x="160" y="355" width="5" height="45" fill="#2d1b0e" />
          <ellipse cx="162" cy="350" rx="18" ry="16" fill="#e91e63" opacity="0.7" />

          {/* Sakura trees right */}
          <rect x="640" y="348" width="6" height="52" fill="#2d1b0e" />
          <ellipse cx="643" cy="343" rx="22" ry="18" fill="#c2185b" opacity="0.75" />
          <ellipse cx="628" cy="353" rx="14" ry="12" fill="#f06292" opacity="0.6" />
          <ellipse cx="658" cy="350" rx="14" ry="12" fill="#e91e63" opacity="0.6" />

          <rect x="680" y="352" width="5" height="48" fill="#2d1b0e" />
          <ellipse cx="682" cy="347" rx="18" ry="16" fill="#e91e63" opacity="0.7" />

          {/* Torii gate silhouette */}
          <rect x="370" y="330" width="8" height="55" fill="#8b1a1a" />
          <rect x="422" y="330" width="8" height="55" fill="#8b1a1a" />
          <rect x="360" y="326" width="80" height="9" rx="2" fill="#b71c1c" />
          <rect x="365" y="338" width="70" height="6" rx="2" fill="#c62828" />

          {/* Falling petals */}
          {[
            [200,280,12],[250,310,8],[320,260,10],[480,275,9],[540,295,11],[610,265,8],[170,330,7],[690,310,9],
          ].map(([x,y,s],i) => (
            <ellipse key={i} cx={x} cy={y} rx={s/2} ry={s/3} fill="#f8bbd0" opacity={0.7} transform={`rotate(${i*25} ${x} ${y})`} />
          ))}

          {/* Foreground ground */}
          <rect x="0" y="410" width="800" height="190" fill="#05111f" />

          {/* Path to torii */}
          <path d="M340,600 Q380,500 395,420 L405,420 Q420,500 460,600 Z" fill="#0d2244" opacity="0.6" />

          {/* Lanterns */}
          <rect x="344" y="430" width="4" height="30" fill="#1a2a3a" />
          <rect x="341" y="425" width="10" height="14" rx="2" fill="#ffa000" opacity="0.9" />
          <rect x="453" y="430" width="4" height="30" fill="#1a2a3a" />
          <rect x="450" y="425" width="10" height="14" rx="2" fill="#ffa000" opacity="0.9" />

          {/* Overlay gradient for text readability */}
          <linearGradient id="overlay" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#050d1a" stopOpacity="0.95" />
            <stop offset="40%" stopColor="#050d1a" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#050d1a" stopOpacity="0" />
          </linearGradient>
          <rect width="800" height="600" fill="url(#overlay)" />
        </svg>

        {/* Hero text overlay */}
        <div className="relative z-10 flex h-full flex-col justify-between p-10">
          {/* Top badge */}
          <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs uppercase tracking-widest text-primary font-semibold backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            ENTGROUP CRM
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
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/30">
              <svg viewBox="0 0 24 24" className="h-7 w-7 fill-none stroke-white stroke-2 stroke-linecap-round stroke-linejoin-round">
                <rect x="3" y="3" width="5" height="18" rx="1" />
                <rect x="10" y="3" width="5" height="12" rx="1" />
                <rect x="17" y="3" width="4" height="8" rx="1" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">ENTGROUP CRM</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "signin" ? "เข้าสู่ระบบบริหารความสัมพันธ์ลูกค้า" : "รีเซ็ตรหัสผ่าน"}
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

          <p className="text-center text-[11px] text-muted-foreground">
            © {new Date().getFullYear()} ENTGROUP Co., Ltd. · All rights reserved
          </p>
        </div>
      </div>
    </div>
  );
}
