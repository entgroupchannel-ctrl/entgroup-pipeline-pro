import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import fujiHero from "@/assets/fuji-hero.jpg";
import logoEntGroup from "@/assets/LOGO_ENTGroup.png.asset.json";

export const Route = createFileRoute("/set-password")({
  component: SetPasswordPage,
});

function SetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // Supabase embeds access_token in the URL hash when user clicks invite/recovery link.
  // We must exchange that token for a session before we can call updateUser.
  useEffect(() => {
    const hash = window.location.hash;

    // Parse token from hash fragment: #access_token=...&type=invite (or recovery)
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const type = params.get("type"); // "invite" | "recovery"

    if (accessToken && (type === "invite" || type === "recovery")) {
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken ?? "" })
        .then(({ error }) => {
          if (error) {
            toast.error("ลิงก์หมดอายุหรือไม่ถูกต้อง กรุณาขอลิงก์ใหม่จากผู้ดูแลระบบ");
            navigate({ to: "/login" });
          } else {
            // Clear hash from URL so token isn't exposed
            history.replaceState(null, "", window.location.pathname);
            setSessionReady(true);
          }
        });
    } else {
      // Check if user already has a valid session (e.g. PASSWORD_RECOVERY flow)
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          setSessionReady(true);
        } else {
          toast.error("ไม่พบ session กรุณาคลิกลิงก์จากอีเมลใหม่");
          navigate({ to: "/login" });
        }
      });
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
      return;
    }
    if (password !== confirm) {
      toast.error("รหัสผ่านไม่ตรงกัน");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      toast.error("ตั้งรหัสผ่านไม่สำเร็จ: " + error.message);
      return;
    }
    setDone(true);
    setTimeout(() => navigate({ to: "/pipeline" }), 2500);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">

      {/* LEFT: Fuji Hero */}
      <div className="relative hidden lg:flex flex-col overflow-hidden bg-sidebar">
        <img
          src={fujiHero}
          alt="ภูเขาไฟฟูจิยาม"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050d1a] via-[#050d1a]/40 to-transparent" />
        <div className="relative z-10 flex h-full flex-col justify-between p-10">
          <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs uppercase tracking-widest text-primary font-semibold backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            CRM
          </div>
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

      {/* RIGHT: Set Password form */}
      <div className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-md space-y-8">

          <div className="text-center space-y-3">
            <img
              src={logoEntGroup.url}
              alt="ENTGROUP logo"
              className="mx-auto h-16 w-auto object-contain"
            />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">ENTGROUP CRM</h1>
              <p className="mt-1 text-sm text-muted-foreground">ตั้งรหัสผ่านสำหรับบัญชีของคุณ</p>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-8 shadow-sm">
            {!sessionReady ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">กำลังตรวจสอบลิงก์...</p>
              </div>
            ) : done ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                <p className="text-base font-semibold">ตั้งรหัสผ่านสำเร็จ!</p>
                <p className="text-sm text-muted-foreground">กำลังพาคุณเข้าสู่ระบบ...</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="pw" className="text-sm font-medium">รหัสผ่านใหม่</Label>
                  <div className="relative">
                    <Input
                      id="pw"
                      type={showPw ? "text" : "password"}
                      required
                      minLength={8}
                      placeholder="อย่างน้อย 8 ตัวอักษร"
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

                <div className="space-y-1.5">
                  <Label htmlFor="confirm" className="text-sm font-medium">ยืนยันรหัสผ่าน</Label>
                  <div className="relative">
                    <Input
                      id="confirm"
                      type={showConfirm ? "text" : "password"}
                      required
                      placeholder="กรอกรหัสผ่านอีกครั้ง"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className="h-11 pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {confirm && password !== confirm && (
                    <p className="text-xs text-red-500">รหัสผ่านไม่ตรงกัน</p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 text-sm font-semibold"
                  disabled={submitting || (confirm.length > 0 && password !== confirm)}
                >
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  ยืนยันรหัสผ่าน
                </Button>
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
