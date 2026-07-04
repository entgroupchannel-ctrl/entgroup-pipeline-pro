import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Phone, MessageCircle, Save, ExternalLink, Loader2, Check, Plus, Send,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { crmDb, ACTIVE_STAGES, STAGE_LABEL_TH, type LeadStage } from "@/lib/crm";
import { formatBaht } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import {
  ACTIVITY_TYPES, ACTIVITY_TYPE_LABEL, activityIcon, formatThaiDate,
  type Activity, type ActivityType,
} from "@/lib/activities";
import { formatThaiDate as formatThaiDay } from "@/lib/format";
import { fetchFADocument, type FADocument } from "@/lib/flowaccount-client";
import { FAImportModal } from "@/components/flowaccount/FAImportModal";
import { LeadQuotationsSection } from "@/components/pipeline/LeadQuotationsSection";
import { X as XIcon, FileDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/leads/$leadId")({
  component: LeadDetailPage,
});

const PIPELINE_STAGES: LeadStage[] = ACTIVE_STAGES;

interface UP { id: string; full_name: string | null; role: string; email?: string | null }

function LeadDetailPage() {
  const { leadId } = Route.useParams();
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const isManager = role === "manager" || role === "admin";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lead, setLead] = useState<any>(null);
  const [account, setAccount] = useState<any>(null);
  const [contact, setContact] = useState<any>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [profiles, setProfiles] = useState<UP[]>([]);
  const [titleEditing, setTitleEditing] = useState(false);
  const [qtEditing, setQtEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [chatterText, setChatterText] = useState("");
  const [faDoc, setFaDoc] = useState<FADocument | null>(null);
  const [faImportOpen, setFaImportOpen] = useState(false);

  const [form, setForm] = useState({
    title: "",
    expected_value: "",
    expected_close_date: "",
    source: "",
    stage: "new" as LeadStage,
    flowaccount_quotation_no: "",
    flowaccount_quotation_url: "",
    owner_id: "" as string,
    stage_changed_at: "" as string,
  });

  const [newAct, setNewAct] = useState<{ type: ActivityType; subject: string; due_at: string; body: string }>({
    type: "call", subject: "", due_at: "", body: "",
  });

  const load = async () => {
    setLoading(true);
    const { data: leadData, error } = await crmDb().from("leads").select("*").eq("id", leadId).maybeSingle();
    if (error || !leadData) {
      toast.error("โหลดดีลไม่สำเร็จ", { description: error?.message });
      setLoading(false);
      return;
    }
    const [accRes, conRes, actRes, profRes] = await Promise.all([
      leadData.account_id
        ? crmDb().from("accounts").select("*").eq("id", leadData.account_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
      leadData.contact_id
        ? crmDb().from("contacts").select("*").eq("id", leadData.contact_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
      crmDb().from("activities").select("*").eq("lead_id", leadId).order("due_at", { ascending: false, nullsFirst: false }),
      crmDb().from("user_profiles").select("*"),
    ]);
    setLead(leadData);
    setAccount(accRes.data);
    setContact(conRes.data);
    setActivities((actRes.data ?? []) as Activity[]);
    setProfiles((profRes.data ?? []) as UP[]);
    setForm({
      title: leadData.title ?? "",
      expected_value: leadData.expected_value != null ? String(leadData.expected_value) : "",
      expected_close_date: leadData.expected_close_date ?? "",
      source: leadData.source ?? "",
      stage: (leadData.stage as LeadStage) ?? "new",
      flowaccount_quotation_no: leadData.flowaccount_quotation_no ?? "",
      flowaccount_quotation_url: leadData.flowaccount_quotation_url ?? "",
      owner_id: leadData.owner_id ?? "",
      stage_changed_at: leadData.updated_at ?? leadData.created_at ?? "",
    });
    if (leadData.fa_inbound_id) {
      fetchFADocument(leadData.fa_inbound_id).then(setFaDoc);
    } else {
      setFaDoc(null);
    }
    setLoading(false);
  };

  const unlinkFA = async () => {
    if (!lead) return;
    const { error } = await crmDb().from("leads").update({ fa_inbound_id: null }).eq("id", lead.id);
    if (error) return toast.error("ยกเลิก link ไม่สำเร็จ", { description: error.message });
    toast.success("ยกเลิก link แล้ว");
    load();
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [leadId]);

  const owner = profiles.find((p) => p.id === form.owner_id) ?? null;

  const overdueCount = useMemo(
    () => activities.filter((a) => !a.done && a.due_at && new Date(a.due_at).getTime() < Date.now()).length,
    [activities],
  );

  const stageChangedDays = useMemo(() => {
    if (!form.stage_changed_at) return 0;
    const d = new Date(form.stage_changed_at).getTime();
    return Math.max(0, Math.floor((Date.now() - d) / 86400000));
  }, [form.stage_changed_at]);

  const logNote = async (subject: string) => {
    await crmDb().from("activities").insert({
      lead_id: leadId, type: "note", subject, done: true,
      done_at: new Date().toISOString(), owner_id: user?.id,
    });
  };

  const saveLead = async (patch: Partial<typeof form> = {}) => {
    if (!lead) return;
    setSaving(true);
    const merged = { ...form, ...patch };
    const payload: any = {
      title: merged.title,
      expected_value: merged.expected_value ? Number(merged.expected_value) : null,
      expected_close_date: merged.expected_close_date || null,
      source: merged.source || null,
      stage: merged.stage,
      flowaccount_quotation_no: merged.flowaccount_quotation_no || null,
      flowaccount_quotation_url: merged.flowaccount_quotation_url || null,
      owner_id: merged.owner_id || null,
    };
    const { error } = await crmDb().from("leads").update(payload).eq("id", lead.id);
    setSaving(false);
    if (error) { toast.error("บันทึกไม่สำเร็จ", { description: error.message }); return false; }
    toast.success("บันทึกแล้ว");
    return true;
  };

  const changeStage = async (next: LeadStage) => {
    if (next === form.stage) return;
    const prev = form.stage;
    setForm((f) => ({ ...f, stage: next }));
    const ok = await saveLead({ stage: next });
    if (ok) {
      await logNote(`เปลี่ยน stage: ${STAGE_LABEL_TH[prev]} → ${STAGE_LABEL_TH[next]}`);
      load();
    } else {
      setForm((f) => ({ ...f, stage: prev }));
    }
  };

  const saveQt = async () => {
    const prevNo = lead?.flowaccount_quotation_no ?? "";
    const ok = await saveLead();
    if (ok) {
      setQtEditing(false);
      if (form.flowaccount_quotation_no && form.flowaccount_quotation_no !== prevNo) {
        await logNote(`link ${form.flowaccount_quotation_no} จาก FlowAccount`);
      }
      load();
    }
  };

  const quickLog = async (type: "call" | "line") => {
    const subject = type === "line" ? "ติดตามทาง Line" : "โทรติดตาม";
    const { error } = await crmDb().from("activities").insert({
      lead_id: leadId, type, subject, done: true,
      done_at: new Date().toISOString(), owner_id: user?.id,
    });
    if (error) return toast.error("บันทึกไม่สำเร็จ", { description: error.message });
    toast.success("บันทึกกิจกรรมแล้ว");
    load();
  };

  const addActivity = async () => {
    if (!newAct.subject.trim()) return toast.error("กรุณาระบุหัวข้อ");
    const { error } = await crmDb().from("activities").insert({
      lead_id: leadId,
      type: newAct.type,
      subject: newAct.subject.trim(),
      body: newAct.body.trim() || null,
      due_at: newAct.due_at ? new Date(newAct.due_at).toISOString() : null,
      done: false,
      owner_id: user?.id,
    });
    if (error) return toast.error("บันทึกไม่สำเร็จ", { description: error.message });
    toast.success("เพิ่มกิจกรรมแล้ว");
    setAddOpen(false);
    setNewAct({ type: "call", subject: "", due_at: "", body: "" });
    load();
  };

  const toggleDone = async (a: Activity, done: boolean) => {
    const { error } = await crmDb()
      .from("activities")
      .update({ done, done_at: done ? new Date().toISOString() : null })
      .eq("id", a.id);
    if (error) return toast.error("อัปเดตไม่สำเร็จ", { description: error.message });
    load();
  };

  const postChatter = async () => {
    if (!chatterText.trim()) return;
    const { error } = await crmDb().from("activities").insert({
      lead_id: leadId, type: "note", subject: chatterText.trim(),
      done: true, done_at: new Date().toISOString(), owner_id: user?.id,
    });
    if (error) return toast.error("บันทึกไม่สำเร็จ", { description: error.message });
    setChatterText("");
    load();
  };

  if (loading || !lead) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentStageIdx = PIPELINE_STAGES.indexOf(form.stage);
  const notes = activities.filter((a) => a.type === "note");
  const tasks = activities.filter((a) => a.type !== "note");

  return (
    <div className="flex h-full flex-col page-fade-in">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/pipeline" })}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Pipeline
          </Button>
          {titleEditing ? (
            <Input
              autoFocus
              className="h-9 max-w-md text-lg font-semibold"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              onBlur={async () => { setTitleEditing(false); await saveLead(); }}
              onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            />
          ) : (
            <h1
              onClick={() => setTitleEditing(true)}
              className="cursor-text truncate text-lg font-semibold hover:text-primary"
              title="คลิกเพื่อแก้ไข"
            >
              {form.title || "-"}
            </h1>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => quickLog("call")}>
            <Phone className="mr-1 h-4 w-4" /> โทรหา
          </Button>
          <Button variant="outline" size="sm" onClick={() => quickLog("line")}>
            <MessageCircle className="mr-1 h-4 w-4" /> ส่ง Line
          </Button>
          <Button size="sm" onClick={() => saveLead()} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            บันทึก
          </Button>
        </div>
      </div>

      {/* Stage bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-6 py-3">
        <div className="flex flex-wrap items-center gap-1">
          {PIPELINE_STAGES.map((s, i) => {
            const done = i < currentStageIdx;
            const active = i === currentStageIdx;
            return (
              <div key={s} className="flex items-center">
                <button
                  onClick={() => changeStage(s)}
                  className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "border-b-2 border-primary bg-primary/10 text-primary"
                      : done
                      ? "text-muted-foreground hover:bg-muted"
                      : "text-muted-foreground/70 hover:bg-muted"
                  }`}
                >
                  {done && <Check className="h-3 w-3" />}
                  {STAGE_LABEL_TH[s]}
                </button>
                {i < PIPELINE_STAGES.length - 1 && <span className="mx-1 text-muted-foreground/50">›</span>}
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => changeStage("won" as LeadStage)}
          >
            ชนะ
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => changeStage("lost" as LeadStage)}
          >
            แพ้
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-6 overflow-auto p-6 lg:flex-row">
        {/* LEFT */}
        <div className="flex-1 space-y-6">
          <Section title="ข้อมูลดีล">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="มูลค่าคาดหวัง (บาท)">
                <Input
                  type="number"
                  value={form.expected_value}
                  onChange={(e) => setForm({ ...form, expected_value: e.target.value })}
                  onBlur={() => saveLead()}
                />
                <div className="mt-1 text-lg font-semibold">{formatBaht(Number(form.expected_value || 0))}</div>
              </Field>
              <Field label="วันปิดคาดหวัง">
                <Input
                  type="date"
                  value={form.expected_close_date}
                  onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })}
                  onBlur={() => saveLead()}
                />
              </Field>
              <Field label="ที่มา (Source)">
                <Select
                  value={form.source || "none"}
                  onValueChange={(v) => { const val = v === "none" ? "" : v; setForm({ ...form, source: val }); saveLead({ source: val }); }}
                >
                  <SelectTrigger><SelectValue placeholder="เลือกที่มา" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">ไม่ระบุ</SelectItem>
                    <SelectItem value="line_oa">LINE OA</SelectItem>
                    <SelectItem value="website">เว็บไซต์</SelectItem>
                    <SelectItem value="referral">แนะนำ</SelectItem>
                    <SelectItem value="other">อื่นๆ</SelectItem>
                  </SelectContent>
                </Select>
                {form.source && <Badge variant="secondary" className="mt-2 text-xs">{form.source}</Badge>}
              </Field>
              <Field label="อยู่ใน stage นี้">
                <div className="text-sm">
                  <span className="text-2xl font-semibold">{stageChangedDays}</span>
                  <span className="ml-1 text-muted-foreground">วัน</span>
                </div>
              </Field>
            </div>
          </Section>

          {/* FlowAccount */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">FlowAccount</div>
              {!lead.fa_inbound_id && !qtEditing && (
                <Button variant="ghost" size="sm" onClick={() => setQtEditing(true)}>แก้ไขด้วยตนเอง</Button>
              )}
            </div>

            {lead.fa_inbound_id && faDoc ? (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm font-semibold text-amber-900 dark:text-amber-100">
                      {faDoc.document_serial}
                    </div>
                    <div className="text-xs text-amber-800/80 dark:text-amber-300/80">
                      {faDoc.contact_name ?? "-"} · {formatBaht(Number(faDoc.grand_total ?? 0))}
                      {faDoc.published_on ? ` · ${formatThaiDay(faDoc.published_on)}` : ""}
                      {faDoc.status_string ? ` · สถานะ: ${faDoc.status_string}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`https://app.flowaccount.com/document/${faDoc.document_serial}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700"
                  >
                    ดูใน FlowAccount <ExternalLink className="h-3 w-3" />
                  </a>
                  <Button variant="ghost" size="sm" onClick={unlinkFA}>
                    <XIcon className="mr-1 h-3 w-3" /> ยกเลิก link
                  </Button>
                </div>
              </div>
            ) : qtEditing ? (
              <div className="space-y-2">
                <Input
                  value={form.flowaccount_quotation_no}
                  onChange={(e) => setForm({ ...form, flowaccount_quotation_no: e.target.value })}
                  placeholder="เลขที่ QT เช่น QT-2025-001"
                />
                <Input
                  value={form.flowaccount_quotation_url}
                  onChange={(e) => setForm({ ...form, flowaccount_quotation_url: e.target.value })}
                  placeholder="ลิงก์ (URL)"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { setQtEditing(false); load(); }}>ยกเลิก</Button>
                  <Button size="sm" onClick={saveQt}>บันทึก</Button>
                </div>
              </div>
            ) : form.flowaccount_quotation_no ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-mono text-sm font-semibold text-amber-900 dark:text-amber-100">
                    {form.flowaccount_quotation_no}
                  </div>
                  <div className="text-xs text-amber-800/80 dark:text-amber-300/80">
                    {formatBaht(Number(form.expected_value || 0))}
                    {form.expected_close_date ? ` · ใช้ได้ถึง ${form.expected_close_date}` : ""}
                  </div>
                </div>
                {form.flowaccount_quotation_url && (
                  <a
                    href={form.flowaccount_quotation_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-amber-900 hover:text-amber-700 dark:text-amber-200"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-amber-800/80 dark:text-amber-300/80">ยังไม่มีใบเสนอราคา</p>
                <Button size="sm" variant="outline" onClick={() => setFaImportOpen(true)}>
                  <FileDown className="mr-1 h-3.5 w-3.5" /> Import จาก FlowAccount
                </Button>
              </div>
            )}
          </div>

          <FAImportModal open={faImportOpen} onOpenChange={setFaImportOpen} onImported={load} />

          <Section title="บริษัทและผู้ติดต่อ">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">บริษัท</div>
                <div className="text-sm font-semibold">{account?.name ?? "-"}</div>
                {account?.industry && <div className="text-xs text-muted-foreground">{account.industry}</div>}
                {account?.website && (
                  <a href={account.website} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    {account.website} <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">ผู้ติดต่อหลัก</div>
                <div className="text-sm font-semibold">{contact?.name ?? "-"}</div>
                {contact?.position && <div className="text-xs text-muted-foreground">{contact.position}</div>}
                {contact?.phone && <div className="text-xs">โทร {contact.phone}</div>}
                {contact?.line_id && <div className="text-xs">Line {contact.line_id}</div>}
              </div>
            </div>
          </Section>

          <Section title="Sales ที่รับผิดชอบ">
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary/10 text-primary">
                  {(owner?.full_name ?? "?").slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{owner?.full_name ?? "ไม่ระบุ"}</div>
                <div className="truncate text-xs text-muted-foreground">{owner?.email ?? owner?.role ?? ""}</div>
              </div>
              {isManager && (
                <Select
                  value={form.owner_id || "none"}
                  onValueChange={(v) => { const val = v === "none" ? "" : v; setForm({ ...form, owner_id: val }); saveLead({ owner_id: val }); }}
                >
                  <SelectTrigger className="w-44"><SelectValue placeholder="มอบหมาย" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">ไม่ระบุ</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.id.slice(0, 8)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </Section>
        </div>

        {/* RIGHT */}
        <aside className="w-full shrink-0 space-y-4 lg:w-[340px]">
          <div className="rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                กิจกรรม
                {overdueCount > 0 && (
                  <Badge variant="destructive" className="h-5 text-[10px]">{overdueCount} เลยกำหนด</Badge>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-b px-4 py-3">
              <Button size="sm" variant="outline" onClick={() => quickLog("call")}>
                <Phone className="mr-1 h-3.5 w-3.5" /> โทรหา
              </Button>
              <Button size="sm" variant="outline" onClick={() => quickLog("line")}>
                <MessageCircle className="mr-1 h-3.5 w-3.5" /> ส่ง Line
              </Button>
              <Button size="sm" variant={addOpen ? "default" : "outline"} onClick={() => setAddOpen((v) => !v)}>
                <Plus className="mr-1 h-3.5 w-3.5" /> เพิ่ม
              </Button>
            </div>

            {addOpen && (
              <div className="space-y-2 border-b bg-muted/30 px-4 py-3">
                <div className="grid grid-cols-2 gap-2">
                  <Select value={newAct.type} onValueChange={(v) => setNewAct({ ...newAct, type: v as ActivityType })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACTIVITY_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{ACTIVITY_TYPE_LABEL[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input type="datetime-local" className="h-9" value={newAct.due_at} onChange={(e) => setNewAct({ ...newAct, due_at: e.target.value })} />
                </div>
                <Input placeholder="หัวข้อ" value={newAct.subject} onChange={(e) => setNewAct({ ...newAct, subject: e.target.value })} />
                <Textarea rows={2} placeholder="โน้ต (ไม่บังคับ)" value={newAct.body} onChange={(e) => setNewAct({ ...newAct, body: e.target.value })} />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setAddOpen(false)}>ยกเลิก</Button>
                  <Button size="sm" onClick={addActivity}>บันทึก</Button>
                </div>
              </div>
            )}

            <ul className="max-h-[400px] overflow-y-auto divide-y">
              {tasks.length === 0 && (
                <li className="py-6 text-center text-xs text-muted-foreground">ยังไม่มีกิจกรรม</li>
              )}
              {tasks.map((a) => {
                const Icon = activityIcon(a.type);
                const overdue = !a.done && !!a.due_at && new Date(a.due_at).getTime() < Date.now();
                return (
                  <li key={a.id} className={`flex items-start gap-2 px-4 py-3 ${a.done ? "opacity-60" : ""}`}>
                    <Checkbox checked={a.done} onCheckedChange={(v) => toggleDone(a, !!v)} className="mt-0.5" />
                    <span
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                        a.done
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : overdue
                          ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm ${a.done ? "line-through" : "font-medium"}`}>
                        {a.subject ?? ACTIVITY_TYPE_LABEL[a.type as ActivityType] ?? a.type}
                      </div>
                      <div className={`text-[11px] ${overdue ? "font-medium text-red-600" : "text-muted-foreground"}`}>
                        {overdue ? "เลยกำหนด · " : ""}
                        {a.due_at ? formatThaiDate(a.due_at) : a.done_at ? `เสร็จ ${formatThaiDate(a.done_at)}` : ""}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Chatter */}
          <div className="rounded-xl border bg-card">
            <div className="border-b px-4 py-3 text-sm font-semibold">Log & โน้ต</div>
            <div className="border-b px-4 py-3">
              <div className="flex gap-2">
                <Textarea
                  rows={2}
                  placeholder="เขียนโน้ต…"
                  value={chatterText}
                  onChange={(e) => setChatterText(e.target.value)}
                />
                <Button size="sm" onClick={postChatter} disabled={!chatterText.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <ul className="max-h-[300px] overflow-y-auto divide-y">
              {notes.length === 0 && (
                <li className="py-6 text-center text-xs text-muted-foreground">ยังไม่มีการเคลื่อนไหว</li>
              )}
              {notes.map((n) => {
                const p = profiles.find((x) => x.id === n.owner_id);
                const initial = (p?.full_name ?? "?").slice(0, 1).toUpperCase();
                return (
                  <li key={n.id} className="flex items-start gap-2 px-4 py-3">
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-[11px] text-primary">{initial}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium">{p?.full_name ?? "ระบบ"}</div>
                      <div className="text-sm">{n.subject}</div>
                      {n.body && <div className="text-xs text-muted-foreground">{n.body}</div>}
                      <div className="text-[11px] text-muted-foreground">{formatThaiDate(n.done_at ?? n.created_at)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="text-center">
            <Link to="/pipeline" className="text-xs text-muted-foreground hover:underline">← กลับไป Pipeline</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
