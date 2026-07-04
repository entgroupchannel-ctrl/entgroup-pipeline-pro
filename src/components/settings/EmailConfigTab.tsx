// ⚠️ DO NOT auto-trigger any side effects
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Mail, KeyRound, CheckCircle2, AlertTriangle, XCircle,
  RefreshCw, Send, ExternalLink, Loader2, Eye, EyeOff, Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getEmailConfig, saveEmailConfig, sendDiagnosticEmail } from "@/lib/email-config.functions";

type Cfg = Awaited<ReturnType<typeof getEmailConfig>>;

export function EmailConfigTab() {
  const doLoad = useServerFn(getEmailConfig);
  const doSave = useServerFn(saveEmailConfig);
  const doTest = useServerFn(sendDiagnosticEmail);

  const [cfg,     setCfg]     = useState<Cfg | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [sending, setSending] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testTo,  setTestTo]  = useState("");

  const [form, setForm] = useState({
    resend_api_key: "",
    from_email:     "",
    company_name:   "ENTGROUP",
    reply_to:       "",
    is_active:      false,
  });

  const reload = async () => {
    setLoading(true);
    try {
      const c = await doLoad() as Cfg;
      setCfg(c);
      setForm((f) => ({
        ...f,
        resend_api_key: "",           // never pre-fill
        from_email:    c.fromEmail    || "",
        company_name:  c.companyName  || "ENTGROUP",
        is_active:     c.isActive     ?? false,
      }));
    } catch (e: any) {
      toast.error(`โหลดไม่สำเร็จ: ${e?.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const handleSave = async () => {
    if (!form.from_email)   return toast.error("กรุณากรอก From Email");
    if (!form.company_name) return toast.error("กรุณากรอกชื่อบริษัท");
    if (!form.resend_api_key && !cfg?.hasKey) return toast.error("กรุณากรอก Resend API Key");

    setSaving(true);
    try {
      await doSave({
        data: {
          resend_api_key: form.resend_api_key || "KEEP_EXISTING",
          from_email:     form.from_email,
          company_name:   form.company_name,
          reply_to:       form.reply_to || undefined,
          is_active:      form.is_active,
        },
      });
      toast.success("บันทึก Email config แล้ว");
      setForm((f) => ({ ...f, resend_api_key: "" }));
      await reload();
    } catch (e: any) {
      toast.error(`บันทึกไม่สำเร็จ: ${e?.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testTo) return toast.error("กรอกอีเมลปลายทางก่อน");
    setSending(true);
    try {
      await doTest({ data: { to: testTo } });
      toast.success(`ส่งอีเมลทดสอบไปยัง ${testTo} แล้ว ✓`);
    } catch (e: any) {
      toast.error(`ส่งไม่สำเร็จ: ${e?.message}`);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const StatusIcon = ({ ok }: { ok: boolean | null }) =>
    ok === true  ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> :
    ok === false ? <XCircle      className="h-4 w-4 text-red-500" /> :
                  <AlertTriangle className="h-4 w-4 text-amber-500" />;

  const resendOk = cfg?.resendStatus === "ok" ? true : cfg?.resendStatus === "invalid" ? false : null;

  return (
    <div className="max-w-xl space-y-6">

      {/* ── Status banner ── */}
      <div className={`flex items-center gap-3 rounded-xl border p-4 ${
        form.is_active
          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20"
          : "border-muted bg-muted/30"
      }`}>
        {form.is_active
          ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          : <XCircle       className="h-5 w-5 shrink-0 text-muted-foreground" />}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">
            {form.is_active ? "ระบบอีเมลเปิดใช้งานอยู่" : "ระบบอีเมลปิดอยู่"}
          </div>
          {cfg?.lastTestedAt && (
            <div className="text-xs text-muted-foreground truncate">
              ทดสอบล่าสุด: {new Date(cfg.lastTestedAt).toLocaleString("th-TH")}
              {cfg.testError && <span className="ml-2 text-red-500">({cfg.testError.slice(0, 50)})</span>}
            </div>
          )}
        </div>
        <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
      </div>

      {/* ── Credentials ── */}
      <section className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" /> ตั้งค่าอีเมล (Resend)
          </h2>
          <Button variant="ghost" size="sm" onClick={reload} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        <div>
          <Label className="text-xs">
            Resend API Key <span className="text-red-500">*</span>
            {cfg?.hasKey && (
              <span className="ml-2 font-mono text-[11px] text-muted-foreground">{cfg.keyShape.masked}</span>
            )}
          </Label>
          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              placeholder={cfg?.hasKey ? "กรอกใหม่เพื่อเปลี่ยน (ทิ้งว่างเพื่อคงเดิม)" : "re_xxxxxxxxxxxxxxxxxxxx"}
              value={form.resend_api_key}
              onChange={(e) => setForm({ ...form, resend_api_key: e.target.value })}
              className="pr-10"
            />
            <button type="button" onClick={() => setShowKey((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            สร้าง API Key ได้ที่{" "}
            <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer" className="text-primary hover:underline">
              resend.com/api-keys
            </a>
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">From Email <span className="text-red-500">*</span></Label>
            <Input
              type="email"
              placeholder="crm@entgroup.co.th"
              value={form.from_email}
              onChange={(e) => setForm({ ...form, from_email: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Reply-To (optional)</Label>
            <Input
              type="email"
              placeholder="noreply@entgroup.co.th"
              value={form.reply_to}
              onChange={(e) => setForm({ ...form, reply_to: e.target.value })}
            />
          </div>
        </div>

        <div>
          <Label className="text-xs">ชื่อบริษัท (ใช้ใน email subject/from) <span className="text-red-500">*</span></Label>
          <Input
            placeholder="ENTGROUP"
            value={form.company_name}
            onChange={(e) => setForm({ ...form, company_name: e.target.value })}
          />
        </div>

        <div className="flex justify-end border-t pt-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            บันทึก
          </Button>
        </div>
      </section>

      {/* ── Resend domain status ── */}
      <section className="rounded-xl border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <StatusIcon ok={resendOk} />
          สถานะการตรวจโดเมน Resend
        </div>
        <p className="text-xs text-muted-foreground">{cfg?.resendMessage ?? "กำลังตรวจสอบ..."}</p>

        {cfg?.resendStatus === "limited" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
            Key อาจเป็น Sending access เท่านั้น — Domains API ตรวจไม่ได้ ใช้ปุ่มส่งทดสอบด้านล่างเพื่อยืนยันแทน
          </div>
        )}

        {cfg?.fromDomainMatch && (
          <div className="flex items-center gap-2 text-xs">
            <StatusIcon ok={cfg.fromDomainMatch.verified ? true : cfg.fromDomainMatch.found ? false : false} />
            โดเมน <code className="rounded bg-muted px-1 py-0.5">{cfg.fromDomainMatch.domain}</code>
            {cfg.fromDomainMatch.verified
              ? <span className="text-emerald-600">verified ✓</span>
              : cfg.fromDomainMatch.found
              ? <span className="text-amber-600">พบแต่ยังไม่ verified</span>
              : <span className="text-red-600">ไม่พบในบัญชี Resend นี้</span>}
          </div>
        )}

        {cfg && cfg.domains.length > 0 && (
          <div className="rounded-lg border overflow-hidden">
            <div className="bg-muted/40 px-3 py-2 text-xs font-medium">โดเมนใน Resend ({cfg.domains.length})</div>
            <table className="w-full text-xs">
              <thead className="bg-muted/20 text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">โดเมน</th>
                  <th className="px-3 py-1.5 text-left font-medium">สถานะ</th>
                  <th className="px-3 py-1.5 text-left font-medium">Region</th>
                </tr>
              </thead>
              <tbody>
                {cfg.domains.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="px-3 py-1.5 font-mono">{d.name}</td>
                    <td className="px-3 py-1.5">
                      {d.status === "verified"
                        ? <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3 w-3" />verified</span>
                        : <span className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3 w-3" />{d.status}</span>}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{d.region ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Test email ── */}
      <section className="rounded-xl border bg-card p-5 space-y-3">
        <div className="text-sm font-semibold">ส่งอีเมลทดสอบ</div>
        <p className="text-xs text-muted-foreground">
          เรียก Resend API จริง ใช้ยืนยันว่า API Key + From Email ส่งได้หรือไม่
        </p>
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="you@example.com"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleTest()}
          />
          <Button onClick={handleTest} disabled={sending || !testTo || !form.is_active} variant="outline" className="shrink-0">
            {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
            ส่งทดสอบ
          </Button>
        </div>
        {!form.is_active && (
          <p className="text-xs text-amber-600 dark:text-amber-400">⚠ เปิดสวิตช์และบันทึกก่อน จึงจะส่งทดสอบได้</p>
        )}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ExternalLink className="h-3 w-3" />
          จัดการ API key และยืนยันโดเมนได้ที่{" "}
          <a href="https://resend.com/domains" target="_blank" rel="noreferrer" className="text-primary hover:underline">
            resend.com/domains
          </a>
        </div>
      </section>
    </div>
  );
}
