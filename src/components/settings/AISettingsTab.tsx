// ⚠️ DO NOT auto-trigger any side effects
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bot, KeyRound, CheckCircle2, XCircle, AlertTriangle,
  Eye, EyeOff, Save, RefreshCw, Loader2, Sparkles, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { loadAISettings, saveAISettings, testAIDraft, type AISettings } from "@/lib/ai-settings.functions";

const MODELS = [
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (แนะนำ — เร็ว + คุ้มค่า)" },
  { value: "claude-opus-4-6",   label: "Claude Opus 4.6 (ฉลาดที่สุด — ราคาสูงกว่า)" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (เร็วมาก — ประหยัด)" },
];

export function AISettingsTab() {
  const doLoad = useServerFn(loadAISettings);
  const doSave = useServerFn(saveAISettings);
  const doTest = useServerFn(testAIDraft);

  const [cfg,      setCfg]      = useState<AISettings | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [testing,  setTesting]  = useState(false);
  const [showKey,  setShowKey]  = useState(false);
  const [testPrompt, setTestPrompt] = useState("ติดตามใบเสนอราคาที่ส่งไปเมื่อสัปดาห์ที่แล้ว");
  const [draftResult, setDraftResult] = useState("");

  const [form, setForm] = useState({
    claude_api_key:      "",
    model:               "claude-sonnet-4-6",
    email_draft_enabled: true,
    max_tokens:          1000,
    is_active:           false,
  });

  const reload = async () => {
    setLoading(true);
    try {
      const c = await doLoad() as AISettings;
      setCfg(c);
      setForm((f) => ({
        ...f,
        claude_api_key:      "",  // never pre-fill
        model:               c.model,
        email_draft_enabled: c.emailDraftEnabled,
        max_tokens:          c.maxTokens,
        is_active:           c.isActive,
      }));
    } catch (e: any) {
      toast.error(`โหลดไม่สำเร็จ: ${e?.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const handleSave = async () => {
    if (!form.claude_api_key && !cfg?.hasKey) {
      toast.error("กรุณากรอก Claude API Key");
      return;
    }

    setSaving(true);
    try {
      await doSave({
        data: {
          claude_api_key:      form.claude_api_key || "KEEP_EXISTING",
          model:               form.model,
          email_draft_enabled: form.email_draft_enabled,
          max_tokens:          form.max_tokens,
          is_active:           form.is_active,
        },
      });
      toast.success("บันทึก AI config แล้ว ✅");
      setForm((f) => ({ ...f, claude_api_key: "" }));
      await reload();
    } catch (e: any) {
      toast.error(`บันทึกไม่สำเร็จ: ${e?.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testPrompt.trim()) return;
    setTesting(true);
    setDraftResult("");
    try {
      const res = await doTest({ data: { prompt: testPrompt } }) as { draft: string };
      setDraftResult(res.draft);
      toast.success("ร่างอีเมลสำเร็จ ✅");
    } catch (e: any) {
      toast.error(`ทดสอบไม่สำเร็จ: ${e?.message}`);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Status indicator ──
  const StatusIcon = () => {
    if (cfg?.keyStatus === "ok")      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    if (cfg?.keyStatus === "invalid") return <XCircle      className="h-4 w-4 text-red-500" />;
    if (cfg?.keyStatus === "no_key")  return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  };

  const statusBg =
    cfg?.keyStatus === "ok"      ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20" :
    cfg?.keyStatus === "invalid" ? "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20" :
                                   "border-muted bg-muted/30";

  return (
    <div className="max-w-xl space-y-6">

      {/* ── Status banner ── */}
      <div className={`flex items-center gap-3 rounded-xl border p-4 ${statusBg}`}>
        <Bot className="h-5 w-5 shrink-0 text-primary" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <StatusIcon />
            {form.is_active ? "Claude AI เปิดใช้งานอยู่" : "Claude AI ปิดอยู่"}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">
            {cfg?.keyMessage}
            {cfg?.keyMasked && (
              <span className="ml-2 font-mono">{cfg.keyMasked}</span>
            )}
          </div>
          {cfg?.updatedAt && (
            <div className="text-[11px] text-muted-foreground mt-0.5">
              อัปเดตล่าสุด: {new Date(cfg.updatedAt).toLocaleString("th-TH")}
            </div>
          )}
        </div>
        <Switch
          checked={form.is_active}
          onCheckedChange={(v) => setForm({ ...form, is_active: v })}
        />
      </div>

      {/* ── API Key section ── */}
      <section className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            Claude API Key
          </h2>
          <Button variant="ghost" size="sm" onClick={reload} disabled={loading}>
            {loading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        {/* API Key input */}
        <div>
          <Label className="text-xs">
            API Key{" "}
            <span className="text-red-500">*</span>
            {cfg?.hasKey && (
              <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                {cfg.keyMasked}
              </span>
            )}
          </Label>
          <div className="relative mt-1">
            <Input
              type={showKey ? "text" : "password"}
              placeholder={
                cfg?.hasKey
                  ? "กรอกใหม่เพื่อเปลี่ยน (ทิ้งว่างเพื่อคงเดิม)"
                  : "sk-ant-api03-xxxxxxxxxxxxxxxxxxxx"
              }
              value={form.claude_api_key}
              onChange={(e) => setForm({ ...form, claude_api_key: e.target.value })}
              className="pr-10 font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground flex items-center gap-1">
            <ExternalLink className="h-3 w-3 shrink-0" />
            สร้าง API Key ได้ที่{" "}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              console.anthropic.com/settings/keys
            </a>
          </p>
        </div>

        {/* Model selector */}
        <div>
          <Label className="text-xs">โมเดลที่ใช้ร่างอีเมล</Label>
          <Select
            value={form.model}
            onValueChange={(v) => setForm({ ...form, model: v })}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODELS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Sonnet 4.6 เหมาะสำหรับงานประจำ — คุณภาพดีและราคาสมเหตุสมผล
          </p>
        </div>

        {/* Max tokens */}
        <div>
          <Label className="text-xs">ความยาว draft สูงสุด (tokens)</Label>
          <div className="flex items-center gap-3 mt-1">
            <input
              type="range"
              min={100}
              max={4000}
              step={100}
              value={form.max_tokens}
              onChange={(e) => setForm({ ...form, max_tokens: Number(e.target.value) })}
              className="flex-1 accent-primary"
            />
            <span className="w-16 text-center text-sm font-medium border rounded px-2 py-1 bg-muted/40">
              {form.max_tokens.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
            <span>100 (สั้น)</span>
            <span>1,000 (ปกติ)</span>
            <span>4,000 (ยาว)</span>
          </div>
        </div>

        {/* Feature toggles */}
        <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            ฟีเจอร์ที่ใช้ AI
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">ร่างอีเมลอัตโนมัติ</div>
              <div className="text-xs text-muted-foreground">
                ในหน้า "ส่งอีเมล" และ Email Composer — ปุ่ม "AI Draft"
              </div>
            </div>
            <Switch
              checked={form.email_draft_enabled}
              onCheckedChange={(v) => setForm({ ...form, email_draft_enabled: v })}
            />
          </div>
        </div>

        <div className="flex justify-end border-t pt-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving
              ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              : <Save className="mr-1 h-4 w-4" />}
            บันทึก
          </Button>
        </div>
      </section>

      {/* ── Test draft ── */}
      <section className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">ทดสอบร่างอีเมล</span>
        </div>
        <p className="text-xs text-muted-foreground">
          กรอกบริบทสั้น ๆ แล้วกด "ร่างอีเมล" เพื่อดูว่า Claude ตอบสนองได้ถูกต้องไหม
        </p>

        <div>
          <Label className="text-xs">บริบท / จุดประสงค์</Label>
          <Input
            className="mt-1"
            placeholder="เช่น ติดตามใบเสนอราคา QT-2026-0012 ที่ส่งไปสัปดาห์ที่แล้ว"
            value={testPrompt}
            onChange={(e) => setTestPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleTest()}
          />
        </div>

        <Button
          onClick={handleTest}
          disabled={testing || !form.is_active || !cfg?.hasKey || !testPrompt.trim()}
          variant="outline"
          className="w-full"
        >
          {testing
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> กำลังร่าง...</>
            : <><Sparkles className="mr-2 h-4 w-4" /> ร่างอีเมลทดสอบ</>}
        </Button>

        {!form.is_active && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            ⚠ เปิดสวิตช์และบันทึกก่อน จึงจะทดสอบได้
          </p>
        )}
        {form.is_active && !cfg?.hasKey && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            ⚠ บันทึก API Key ก่อน จึงจะทดสอบได้
          </p>
        )}

        {draftResult && (
          <div className="space-y-2">
            <Label className="text-xs">ผลลัพธ์จาก Claude</Label>
            <Textarea
              readOnly
              rows={8}
              value={draftResult}
              className="resize-none font-sans text-sm bg-muted/30"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(draftResult);
                toast.success("คัดลอกแล้ว");
              }}
              className="text-xs text-primary hover:underline"
            >
              คัดลอกข้อความ
            </button>
          </div>
        )}
      </section>

      {/* ── Info card ── */}
      <section className="rounded-xl border bg-muted/20 p-4 space-y-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          ข้อมูล Claude API
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>• API Key เก็บเข้ารหัสใน <code className="rounded bg-muted px-1">crm.integrations</code> — ไม่ส่งออก frontend</p>
          <p>• ค่าใช้จ่ายขึ้นกับ Anthropic Console ของคุณ ไม่ผ่าน ENTGROUP</p>
          <p>• Sonnet 4.6 ≈ $3/M input tokens, $15/M output — ร่างอีเมล 1 ฉบับ ≈ $0.005</p>
        </div>
        <a
          href="https://console.anthropic.com"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
        >
          <ExternalLink className="h-3 w-3" />
          Anthropic Console
        </a>
      </section>

    </div>
  );
}
