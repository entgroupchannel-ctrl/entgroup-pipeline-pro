// ⚠️ DO NOT auto-trigger any side effects
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, Loader2, Eye, EyeOff, Zap, Copy,
  MessageCircle, Trash2, Plus, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  loadLineSettings, saveLineSettings, testLineConnection,
  loadLineMappings, saveLineMapping, deleteLineMapping,
} from "@/lib/line-settings.functions";
import { crmDb } from "@/lib/crm";

type Settings = Awaited<ReturnType<typeof loadLineSettings>>;
type Mapping   = Awaited<ReturnType<typeof loadLineMappings>>[number];

// ── helpers ───────────────────────────────────────────────────────────────────

const WEBHOOK_BASE = typeof window !== "undefined"
  ? `${window.location.origin}/api/line/webhook`
  : "https://crm.entgroup.co.th/api/line/webhook";

// ── Main component ────────────────────────────────────────────────────────────

export function LineOATab() {
  const doLoad   = useServerFn(loadLineSettings);
  const doSave   = useServerFn(saveLineSettings);
  const doTest   = useServerFn(testLineConnection);
  const doLoadMaps = useServerFn(loadLineMappings);
  const doSaveMap  = useServerFn(saveLineMapping);
  const doDelMap   = useServerFn(deleteLineMapping);

  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [testing,  setTesting]  = useState(false);
  const [botInfo,  setBotInfo]  = useState<{ name: string; uid: string } | null>(null);

  const [showToken,  setShowToken]  = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showNotify, setShowNotify] = useState(false);

  const [form, setForm] = useState({
    channel_access_token: "",
    channel_secret:       "",
    line_notify_token:    "",
    is_active:            false,
    auto_create_lead:     true,
    log_activity:         true,
    notify_sales:         true,
    pipeline_badge:       true,
  });

  const [mappings,   setMappings]   = useState<Mapping[]>([]);
  const [mapsLoading, setMapsLoading] = useState(false);
  const [addingMap,  setAddingMap]  = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [contactResults, setContactResults] = useState<any[]>([]);
  const [newMap, setNewMap] = useState({ line_uid: "", display_name: "", contact_id: "" });

  // ── Load ────────────────────────────────────────────────────────────────

  const reload = async () => {
    setLoading(true);
    try {
      const s = await doLoad() as Settings;
      setSettings(s);
      setForm((f) => ({
        ...f,
        is_active:        s.is_active,
        auto_create_lead: s.auto_create_lead,
        log_activity:     s.log_activity,
        notify_sales:     s.notify_sales,
        pipeline_badge:   s.pipeline_badge,
      }));
    } catch (e: any) {
      toast.error(`โหลดไม่สำเร็จ: ${e?.message}`);
    } finally {
      setLoading(false);
    }
  };

  const reloadMaps = async () => {
    setMapsLoading(true);
    try {
      const maps = await doLoadMaps() as Mapping[];
      setMappings(maps);
    } catch (e: any) {
      toast.error(`โหลด mapping ไม่สำเร็จ: ${e?.message}`);
    } finally {
      setMapsLoading(false);
    }
  };

  useEffect(() => { reload(); reloadMaps(); }, []);

  // ── Contact search (for mapping) ─────────────────────────────────────────

  useEffect(() => {
    if (!contactSearch.trim()) { setContactResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await crmDb()
        .from("contacts")
        .select("id, name, email")
        .or(`name.ilike.%${contactSearch}%,email.ilike.%${contactSearch}%`)
        .limit(6);
      setContactResults(data ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [contactSearch]);

  // ── Save ────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    const hasToken  = !!(settings?.channel_access_token_masked) || !!form.channel_access_token.trim();
    const hasSecret = !!(settings?.channel_secret_masked) || !!form.channel_secret.trim();
    if (!hasToken)  { toast.error("กรุณากรอก Channel Access Token"); return; }
    if (!hasSecret) { toast.error("กรุณากรอก Channel Secret"); return; }

    setSaving(true);
    try {
      await doSave({
        data: {
          channel_access_token: form.channel_access_token.trim() || "KEEP_EXISTING",
          channel_secret:       form.channel_secret.trim()       || "KEEP_EXISTING",
          line_notify_token:    form.line_notify_token.trim()    || "KEEP_EXISTING",
          is_active:            form.is_active,
          auto_create_lead:     form.auto_create_lead,
          log_activity:         form.log_activity,
          notify_sales:         form.notify_sales,
          pipeline_badge:       form.pipeline_badge,
        },
      });
      toast.success("บันทึกแล้ว");
      reload();
    } catch (e: any) {
      toast.error("บันทึกไม่สำเร็จ", { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  // ── Test ────────────────────────────────────────────────────────────────

  const handleTest = async () => {
    setTesting(true);
    setBotInfo(null);
    try {
      const res = await doTest() as any;
      setBotInfo({ name: res.bot_name ?? "LINE Bot", uid: res.bot_user_id ?? "" });
      toast.success(`เชื่อมต่อสำเร็จ — Bot: ${res.bot_name}`);
      reload();
    } catch (e: any) {
      toast.error("ทดสอบไม่สำเร็จ", { description: e?.message });
      reload();
    } finally {
      setTesting(false);
    }
  };

  // ── Add mapping ──────────────────────────────────────────────────────────

  const handleAddMap = async () => {
    if (!newMap.line_uid.trim())  { toast.error("กรุณากรอก LINE uid"); return; }
    if (!newMap.contact_id)       { toast.error("กรุณาเลือก Contact"); return; }
    try {
      await doSaveMap({ data: {
        line_uid:     newMap.line_uid.trim(),
        display_name: newMap.display_name.trim() || undefined,
        contact_id:   newMap.contact_id,
      }});
      toast.success("เพิ่ม mapping แล้ว");
      setNewMap({ line_uid: "", display_name: "", contact_id: "" });
      setContactSearch("");
      setContactResults([]);
      setAddingMap(false);
      reloadMaps();
    } catch (e: any) {
      toast.error("เพิ่มไม่สำเร็จ", { description: e?.message });
    }
  };

  const handleDelMap = async (uid: string) => {
    try {
      await doDelMap({ data: { line_uid: uid } });
      toast.success("ลบ mapping แล้ว");
      reloadMaps();
    } catch (e: any) {
      toast.error("ลบไม่สำเร็จ", { description: e?.message });
    }
  };

  // ── Status badge ─────────────────────────────────────────────────────────

  const statusOk  = settings?.is_active && !settings?.test_error;
  const statusErr = !!(settings?.test_error);

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-5">

      {/* ── Status banner ── */}
      <div className="flex items-center justify-between rounded-xl border bg-card px-5 py-3">
        <div className="flex items-center gap-3">
          <MessageCircle className="h-5 w-5 text-muted-foreground" />
          <div>
            <span className="text-sm font-medium">LINE OA</span>
            {botInfo && <span className="ml-2 text-xs text-muted-foreground">Bot: {botInfo.name}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {statusOk  && <Badge variant="outline" className="gap-1 border-green-300 text-green-700 text-xs"><CheckCircle2 className="h-3 w-3" />เชื่อมต่อแล้ว</Badge>}
          {statusErr && <Badge variant="outline" className="gap-1 border-red-300 text-red-600 text-xs"><XCircle className="h-3 w-3" />ข้อผิดพลาด</Badge>}
          {!statusOk && !statusErr && <Badge variant="secondary" className="text-xs">ยังไม่เปิดใช้</Badge>}
          <Switch
            checked={form.is_active}
            onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
          />
        </div>
      </div>

      {/* ── Credentials ── */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <p className="text-sm font-medium">Credentials (LINE Developers Console)</p>

        {/* Channel Access Token */}
        <div className="space-y-1.5">
          <Label className="text-xs">Channel Access Token <span className="text-destructive">*</span></Label>
          <div className="flex gap-2">
            <Input
              type={showToken ? "text" : "password"}
              placeholder={settings?.channel_access_token_masked ?? "วางที่นี่…"}
              value={form.channel_access_token}
              onChange={(e) => setForm((f) => ({ ...f, channel_access_token: e.target.value }))}
              className="font-mono text-xs"
            />
            <Button variant="outline" size="icon" onClick={() => setShowToken((v) => !v)}>
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          {settings?.channel_access_token_masked && !form.channel_access_token && (
            <p className="text-xs text-muted-foreground">ใช้ค่าเดิม ({settings.channel_access_token_masked}) — กรอกเพื่อเปลี่ยน</p>
          )}
        </div>

        {/* Channel Secret */}
        <div className="space-y-1.5">
          <Label className="text-xs">Channel Secret <span className="text-destructive">*</span></Label>
          <div className="flex gap-2">
            <Input
              type={showSecret ? "text" : "password"}
              placeholder={settings?.channel_secret_masked ?? "วางที่นี่…"}
              value={form.channel_secret}
              onChange={(e) => setForm((f) => ({ ...f, channel_secret: e.target.value }))}
              className="font-mono text-xs"
            />
            <Button variant="outline" size="icon" onClick={() => setShowSecret((v) => !v)}>
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">เก็บใน Supabase — ไม่แสดง UI หลังบันทึก</p>
        </div>

        {/* Webhook URL (read-only) */}
        <div className="space-y-1.5">
          <Label className="text-xs">Webhook URL <span className="text-muted-foreground">(copy ไปวางใน LINE Console)</span></Label>
          <div className="flex gap-2">
            <Input
              readOnly
              value={WEBHOOK_BASE}
              className="font-mono text-xs text-muted-foreground bg-muted/40"
            />
            <Button
              variant="outline" size="icon"
              onClick={() => { navigator.clipboard.writeText(WEBHOOK_BASE); toast.success("คัดลอกแล้ว"); }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* LINE Notify Token */}
        <div className="space-y-1.5">
          <Label className="text-xs">LINE Notify Token <span className="text-muted-foreground">(สำหรับแจ้งเตือน sales)</span></Label>
          <div className="flex gap-2">
            <Input
              type={showNotify ? "text" : "password"}
              placeholder={settings?.line_notify_token_masked ?? "วางที่นี่…"}
              value={form.line_notify_token}
              onChange={(e) => setForm((f) => ({ ...f, line_notify_token: e.target.value }))}
              className="font-mono text-xs"
            />
            <Button variant="outline" size="icon" onClick={() => setShowNotify((v) => !v)}>
              {showNotify ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 border-t pt-4">
          <Button variant="outline" onClick={handleTest} disabled={testing}>
            {testing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Zap className="mr-1.5 h-4 w-4" />}
            ทดสอบการเชื่อมต่อ
          </Button>
          {settings?.last_tested_at && (
            <span className="text-xs text-muted-foreground">
              ทดสอบล่าสุด: {new Date(settings.last_tested_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
              {settings.test_error && <span className="ml-1 text-destructive">— {settings.test_error}</span>}
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              บันทึก
            </Button>
          </div>
        </div>
      </div>

      {/* ── Behavior toggles ── */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <p className="text-sm font-medium">พฤติกรรมเมื่อได้รับข้อความ</p>

        {([
          { key: "auto_create_lead", label: "สร้าง Lead ใหม่อัตโนมัติ", hint: "เมื่อ LINE uid ไม่ match contact ใด" },
          { key: "log_activity",     label: "Log activity ใน Lead",      hint: "เมื่อ contact พบแล้ว" },
          { key: "notify_sales",     label: "ส่ง LINE Notify ให้ sales", hint: "แจ้ง owner ของ lead ผ่าน LINE" },
          { key: "pipeline_badge",   label: "Badge เด้งบน Kanban card",  hint: "แจ้งเตือน real-time ใน Pipeline" },
        ] as const).map(({ key, label, hint }) => (
          <div key={key} className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm">{label}</p>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
            <Switch
              checked={form[key]}
              onCheckedChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
            />
          </div>
        ))}

        <div className="flex justify-end border-t pt-4">
          <Button onClick={handleSave} disabled={saving} variant="outline" size="sm">
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            บันทึกการตั้งค่า
          </Button>
        </div>
      </div>

      {/* ── Contact mapping table ── */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div>
            <p className="text-sm font-medium">LINE uid → Contact</p>
            <p className="text-xs text-muted-foreground">ผูก LINE user กับ contact ในระบบ</p>
          </div>
          <Button size="sm" onClick={() => setAddingMap((v) => !v)}>
            <Plus className="mr-1 h-4 w-4" /> เพิ่ม
          </Button>
        </div>

        {/* Add mapping form */}
        {addingMap && (
          <div className="border-b bg-muted/30 px-5 py-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground">เพิ่ม mapping ใหม่</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">LINE uid</Label>
                <Input
                  value={newMap.line_uid}
                  onChange={(e) => setNewMap((m) => ({ ...m, line_uid: e.target.value }))}
                  placeholder="Uxxxxxxxx…"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Display name (ไม่บังคับ)</Label>
                <Input
                  value={newMap.display_name}
                  onChange={(e) => setNewMap((m) => ({ ...m, display_name: e.target.value }))}
                  placeholder="ชื่อใน LINE"
                />
              </div>
              <div className="space-y-1 relative">
                <Label className="text-xs">Contact <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="pl-8 text-sm"
                    placeholder="ค้นหาบริษัท…"
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                  />
                </div>
                {contactResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border bg-popover shadow-md divide-y">
                    {contactResults.map((c) => (
                      <button
                        key={c.id}
                        className="flex w-full flex-col px-3 py-2 text-left hover:bg-muted text-sm"
                        onClick={() => {
                          setNewMap((m) => ({ ...m, contact_id: c.id }));
                          setContactSearch(c.name ?? "");
                          setContactResults([]);
                        }}
                      >
                        <span className="font-medium">{c.name}</span>
                        <span className="text-xs text-muted-foreground">{c.email}</span>
                      </button>
                    ))}
                  </div>
                )}
                {newMap.contact_id && (
                  <p className="text-xs text-green-600">เลือกแล้ว ✓</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setAddingMap(false); setNewMap({ line_uid: "", display_name: "", contact_id: "" }); setContactSearch(""); }}>ยกเลิก</Button>
              <Button size="sm" onClick={handleAddMap}>บันทึก mapping</Button>
            </div>
          </div>
        )}

        {/* Mapping list */}
        {mapsLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : mappings.length === 0 ? (
          <div className="px-5 py-6 text-center text-xs text-muted-foreground">ยังไม่มี mapping — เพิ่มเพื่อผูก LINE user กับ contact</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-5 py-2 font-medium">LINE user</th>
                <th className="px-5 py-2 font-medium">Contact</th>
                <th className="px-5 py-2 font-medium">Mapped by</th>
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody>
              {mappings.map((m: any) => (
                <tr key={m.line_uid} className="border-b last:border-0">
                  <td className="px-5 py-3">
                    <p className="font-medium">{m.display_name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground font-mono">{m.line_uid}</p>
                  </td>
                  <td className="px-5 py-3">
                    <p>{m.contact?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground font-mono text-[10px]">{m.contact?.id?.slice(0, 8)}…</p>
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {m.mapper?.full_name ?? "—"}
                    {m.mapped_at && (
                      <span className="block">
                        {new Date(m.mapped_at).toLocaleDateString("th-TH", { dateStyle: "short" })}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelMap(m.line_uid)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
