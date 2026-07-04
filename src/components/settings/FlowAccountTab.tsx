// ⚠️ DO NOT auto-trigger any side effects
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  RefreshCw, Save, CheckCircle2, XCircle, Loader2, Eye, EyeOff, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatThaiDate } from "@/lib/format";
import {
  loadFASettings,
  saveFACredentials,
  syncFADocuments,
  testFAConnection,
} from "@/lib/flowaccount.functions";

export function FlowAccountTab() {
  const load   = useServerFn(loadFASettings);
  const save   = useServerFn(saveFACredentials);
  const sync   = useServerFn(syncFADocuments);
  const test   = useServerFn(testFAConnection);

  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncResults, setSyncResults] = useState<any[]>([]);
  const [showSecret, setShowSecret] = useState(false);

  const [form, setForm] = useState({
    client_id: "",
    client_secret: "",
    base_url: "https://openapi.flowaccount.com/v1",
    token_url: "https://openapi.flowaccount.com/token",
    is_active: false,
  });

  const loadSettings = async () => {
    setLoading(true);
    try {
      const s = await load();
      setSettings(s);
      setForm((f) => ({
        ...f,
        client_id: (s as any).client_id ?? "",
        client_secret: "",
        base_url: (s as any).base_url || "https://openapi.flowaccount.com/v1",
        token_url: (s as any).token_url || "https://openapi.flowaccount.com/token",
        is_active: (s as any).is_active ?? false,
      }));
    } catch (e: any) {
      toast.error(e?.message ?? "โหลด settings ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSettings(); }, []);

  const handleSave = async () => {
    if (!form.client_id.trim()) return toast.error("กรุณากรอก Client ID");
    const secretToSend = form.client_secret.trim();
    if (!secretToSend && !(settings as any)?.client_secret_masked) {
      return toast.error("กรุณากรอก Client Secret");
    }
    setSaving(true);
    try {
      await save({
        data: {
          client_id: form.client_id.trim(),
          client_secret: secretToSend || "KEEP_EXISTING",
          base_url: form.base_url.trim() || undefined,
          token_url: form.token_url.trim() || undefined,
          is_active: form.is_active,
        },
      });
      toast.success("บันทึก credentials แล้ว");
      await loadSettings();
    } catch (e: any) {
      toast.error(e?.message ?? "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await test();
      toast.success("เชื่อมต่อ FlowAccount สำเร็จ ✓");
    } catch (e: any) {
      toast.error(`เชื่อมต่อไม่สำเร็จ: ${e?.message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResults([]);
    try {
      const res: any = await sync();
      const results = res?.results ?? [];
      setSyncResults(results);
      const total = results.reduce((s: number, r: any) => s + (r.upserted || 0), 0);
      const hasErr = results.some((r: any) => r.error);
      if (hasErr) toast.warning(`Sync เสร็จ: บันทึก ${total} รายการ (มี error)`);
      else toast.success(`Sync เสร็จ: บันทึก/อัปเดต ${total} รายการ`);
      await loadSettings();
    } catch (e: any) {
      toast.error(`Sync ไม่สำเร็จ: ${e?.message}`);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const lastSync = (settings as any)?.last_synced_at;
  const syncError = (settings as any)?.sync_error;
  const secretMasked = (settings as any)?.client_secret_masked;

  return (
    <div className="max-w-xl space-y-6">
      {/* Status */}
      <div className={`flex items-center gap-3 rounded-xl border p-4 ${
        form.is_active
          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20"
          : "border-muted bg-muted/30"
      }`}>
        {form.is_active
          ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          : <XCircle className="h-5 w-5 text-muted-foreground" />}
        <div className="flex-1">
          <div className="text-sm font-semibold">
            {form.is_active ? "FlowAccount เปิดใช้งานอยู่" : "FlowAccount ปิดอยู่"}
          </div>
          {lastSync && (
            <div className="text-xs text-muted-foreground">
              Sync ล่าสุด: {formatThaiDate(lastSync)}
              {syncError && <span className="ml-2 text-red-500">({syncError.slice(0, 60)})</span>}
            </div>
          )}
        </div>
        <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
      </div>

      {/* Credentials */}
      <section className="rounded-xl border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold">Credentials (OAuth2 Client Credentials)</h2>
        <div>
          <Label className="text-xs">Client ID <span className="text-red-500">*</span></Label>
          <Input placeholder="fa_client_xxxxxxxx" value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">
            Client Secret <span className="text-red-500">*</span>
            {secretMasked && <span className="ml-2 font-mono text-muted-foreground">{secretMasked}</span>}
          </Label>
          <div className="relative">
            <Input
              type={showSecret ? "text" : "password"}
              placeholder={secretMasked ? "กรอกใหม่เพื่อเปลี่ยน" : "fa_secret_xxxxxxxx"}
              value={form.client_secret}
              onChange={(e) => setForm({ ...form, client_secret: e.target.value })}
              className="pr-10"
            />
            <button type="button" onClick={() => setShowSecret((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">เก็บ encrypted ใน Supabase — ไม่แสดงใน UI</p>
        </div>
        <div>
          <Label className="text-xs">Base URL</Label>
          <Input value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Token URL</Label>
          <Input value={form.token_url} onChange={(e) => setForm({ ...form, token_url: e.target.value })} />
        </div>
        <div className="flex items-center justify-between pt-2 border-t">
          <Button variant="outline" size="sm" onClick={handleTest} disabled={testing || !form.is_active}>
            {testing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Zap className="mr-1.5 h-4 w-4" />}
            ทดสอบการเชื่อมต่อ
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            บันทึก
          </Button>
        </div>
      </section>

      {/* Sync */}
      <section className="rounded-xl border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Sync เอกสาร</h2>
            <p className="text-xs text-muted-foreground">ดึง Quotation + Billing Note จาก FlowAccount API</p>
          </div>
          <Button onClick={handleSync} disabled={syncing || !form.is_active} variant="outline">
            {syncing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
            {syncing ? "กำลัง Sync…" : "Sync ตอนนี้"}
          </Button>
        </div>
        {syncResults.length > 0 && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
            {syncResults.map((r) => (
              <div key={r.type} className="flex items-center gap-3 text-xs">
                {r.error
                  ? <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                  : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
                <span className="font-medium w-24">{r.type === "quotation" ? "Quotation" : "Billing Note"}</span>
                {r.error
                  ? <span className="text-red-600 truncate">{r.error}</span>
                  : <span className="text-muted-foreground">ดึงมา {r.fetched} → บันทึก {r.upserted}{r.skipped > 0 ? ` (ข้าม ${r.skipped})` : ""}</span>}
              </div>
            ))}
          </div>
        )}
        {!form.is_active && (
          <p className="text-xs text-amber-600 dark:text-amber-400">⚠ เปิดใช้งาน FlowAccount ก่อนแล้วบันทึก จึงจะ Sync ได้</p>
        )}
      </section>
    </div>
  );
}
