// ⚠️ DO NOT auto-trigger any side effects
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw, Save, CheckCircle2, XCircle, Loader2, Eye, EyeOff, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatThaiDate } from "@/lib/format";
import { loadFASettings, saveFACredentials, syncFADocuments, testFAConnection } from "@/lib/flowaccount.functions";

export function FlowAccountTab() {
  const doLoad = useServerFn(loadFASettings);
  const doSave = useServerFn(saveFACredentials);
  const doSync = useServerFn(syncFADocuments);
  const doTest = useServerFn(testFAConnection);

  const [settings, setSettings]     = useState<any>(null);
  const [loading,  setLoading]       = useState(true);
  const [saving,   setSaving]        = useState(false);
  const [syncing,  setSyncing]       = useState(false);
  const [testing,  setTesting]       = useState(false);
  const [results,  setResults]       = useState<any[]>([]);
  const [showSecret, setShowSecret]  = useState(false);

  const [form, setForm] = useState({
    client_id:     "",
    client_secret: "",          // empty = keep existing
    base_url:      "https://openapi.flowaccount.com/v1",
    token_url:     "https://openapi.flowaccount.com/token",
    is_active:     false,
  });

  // ── Load ─────────────────────────────────────────────────────────────────
  const reload = async () => {
    setLoading(true);
    try {
      const s: any = await doLoad();
      setSettings(s);
      setForm((f) => ({
        ...f,
        client_id:     s.client_id   ?? "",
        client_secret: "",            // never pre-fill
        base_url:      s.base_url    || "https://openapi.flowaccount.com/v1",
        token_url:     s.token_url   || "https://openapi.flowaccount.com/token",
        is_active:     s.is_active   ?? false,
      }));
    } catch (e: any) {
      toast.error(`โหลด settings ไม่สำเร็จ: ${e?.message ?? "unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.client_id.trim()) {
      toast.error("กรุณากรอก Client ID");
      return;
    }
    // require secret on first save (no masked value yet)
    const hasExisting = !!(settings as any)?.client_secret_masked;
    if (!form.client_secret.trim() && !hasExisting) {
      toast.error("กรุณากรอก Client Secret");
      return;
    }

    setSaving(true);
    try {
      await doSave({
        data: {
          client_id:     form.client_id.trim(),
          client_secret: form.client_secret.trim() || "KEEP_EXISTING",
          base_url:      form.base_url.trim()  || undefined,
          token_url:     form.token_url.trim() || undefined,
          is_active:     form.is_active,
        },
      });
      toast.success("บันทึก credentials แล้ว");
      setForm((f) => ({ ...f, client_secret: "" }));  // clear secret field
      await reload();
    } catch (e: any) {
      toast.error(`บันทึกไม่สำเร็จ: ${e?.message ?? "unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Test ─────────────────────────────────────────────────────────────────
  const handleTest = async () => {
    setTesting(true);
    try {
      await doTest();
      toast.success("เชื่อมต่อ FlowAccount สำเร็จ ✓");
    } catch (e: any) {
      toast.error(`เชื่อมต่อไม่สำเร็จ: ${e?.message ?? "unknown error"}`);
    } finally {
      setTesting(false);
    }
  };

  // ── Sync ─────────────────────────────────────────────────────────────────
  const handleSync = async () => {
    setSyncing(true);
    setResults([]);
    try {
      const res: any = await doSync();
      const list: any[] = res?.results ?? [];
      setResults(list);
      const total   = list.reduce((s, r) => s + (r.upserted || 0), 0);
      const hasErr  = list.some((r) => r.error);
      if (hasErr) toast.warning(`Sync เสร็จ: บันทึก ${total} รายการ (มี error — ดูรายละเอียดด้านล่าง)`);
      else        toast.success(`Sync เสร็จ: บันทึก/อัปเดต ${total} รายการ`);
      await reload();
    } catch (e: any) {
      toast.error(`Sync ไม่สำเร็จ: ${e?.message ?? "unknown error"}`);
    } finally {
      setSyncing(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const lastSync    = settings?.last_synced_at;
  const syncError   = settings?.sync_error;
  const secretMask  = settings?.client_secret_masked;
  const isActive    = form.is_active;

  return (
    <div className="max-w-xl space-y-6">

      {/* ── Status banner ── */}
      <div className={`flex items-center gap-3 rounded-xl border p-4 ${
        isActive
          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20"
          : "border-muted bg-muted/30"
      }`}>
        {isActive
          ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          : <XCircle       className="h-5 w-5 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">
            {isActive ? "FlowAccount เปิดใช้งานอยู่" : "FlowAccount ปิดอยู่"}
          </div>
          {lastSync && (
            <div className="truncate text-xs text-muted-foreground">
              Sync ล่าสุด: {formatThaiDate(lastSync)}
              {syncError && <span className="ml-2 text-red-500">({syncError.slice(0, 60)})</span>}
            </div>
          )}
        </div>
        <Switch
          checked={isActive}
          onCheckedChange={(v) => setForm({ ...form, is_active: v })}
        />
      </div>

      {/* ── Credentials ── */}
      <section className="rounded-xl border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold">Credentials (OAuth2 Client Credentials)</h2>

        <div>
          <Label className="text-xs">Client ID <span className="text-red-500">*</span></Label>
          <Input
            placeholder="fa_client_xxxxxxxx"
            value={form.client_id}
            onChange={(e) => setForm({ ...form, client_id: e.target.value })}
          />
        </div>

        <div>
          <Label className="text-xs">
            Client Secret <span className="text-red-500">*</span>
            {secretMask && (
              <span className="ml-2 font-mono text-[11px] text-muted-foreground">{secretMask}</span>
            )}
          </Label>
          <div className="relative">
            <Input
              type={showSecret ? "text" : "password"}
              placeholder={secretMask ? "กรอกใหม่เพื่อเปลี่ยน (ทิ้งว่างเพื่อคงเดิม)" : "fa_secret_xxxxxxxx"}
              value={form.client_secret}
              onChange={(e) => setForm({ ...form, client_secret: e.target.value })}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowSecret((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            เก็บใน Supabase — ไม่แสดงใน UI หลังบันทึก
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Base URL</Label>
            <Input
              value={form.base_url}
              onChange={(e) => setForm({ ...form, base_url: e.target.value })}
              placeholder="https://openapi.flowaccount.com/v1"
            />
          </div>
          <div>
            <Label className="text-xs">Token URL</Label>
            <Input
              value={form.token_url}
              onChange={(e) => setForm({ ...form, token_url: e.target.value })}
              placeholder="https://openapi.flowaccount.com/token"
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          <Button
            variant="outline" size="sm"
            onClick={handleTest}
            disabled={testing || !isActive}
            title={!isActive ? "เปิดใช้งานและบันทึกก่อน" : ""}
          >
            {testing
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              : <Zap className="mr-1.5 h-4 w-4" />}
            ทดสอบการเชื่อมต่อ
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving
              ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              : <Save className="mr-1 h-4 w-4" />}
            บันทึก
          </Button>
        </div>
      </section>

      {/* ── Sync ── */}
      <section className="rounded-xl border bg-card p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Sync เอกสาร</h2>
            <p className="text-xs text-muted-foreground">
              ดึง Quotation + Billing Note จาก FlowAccount API → crm.fa_documents
            </p>
          </div>
          <Button
            onClick={handleSync}
            disabled={syncing || !isActive}
            variant="outline"
            size="sm"
            className="shrink-0"
            title={!isActive ? "เปิดใช้งาน FlowAccount ก่อน" : ""}
          >
            {syncing
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              : <RefreshCw className="mr-1.5 h-4 w-4" />}
            {syncing ? "กำลัง Sync…" : "Sync ตอนนี้"}
          </Button>
        </div>

        {/* Result rows */}
        {results.length > 0 && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
            {results.map((r) => (
              <div key={r.type} className="flex items-center gap-3 text-xs">
                {r.error
                  ? <XCircle      className="h-3.5 w-3.5 shrink-0 text-red-500" />
                  : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
                <span className="w-24 font-medium shrink-0">
                  {r.type === "quotation" ? "Quotation" : "Billing Note"}
                </span>
                {r.error
                  ? <span className="truncate text-red-600">{r.error}</span>
                  : <span className="text-muted-foreground">
                      ดึงมา {r.fetched} → บันทึก {r.upserted}
                      {r.skipped > 0 && ` (ข้าม ${r.skipped})`}
                    </span>}
              </div>
            ))}
          </div>
        )}

        {!isActive && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            ⚠ เปิดสวิตช์และบันทึก credentials ก่อน จึงจะ Sync ได้
          </p>
        )}
      </section>
    </div>
  );
}
