import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Phone, MessageCircle, Save, ExternalLink, Loader2, Check, Plus, Send, Mail, Trophy, XCircle, Crown, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { LeadEmailComposer } from "@/components/pipeline/LeadEmailComposer";
import { FileDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/leads/$leadId")({
  component: LeadDetailPage,
});

const PIPELINE_STAGES: LeadStage[] = ACTIVE_STAGES;

interface UP { id: string; full_name: string | null; role: string; email?: string | null; is_active?: boolean | null }

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
  const [emailOpen, setEmailOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [lineOpen, setLineOpen] = useState(false);
  const [wonConfirmOpen, setWonConfirmOpen] = useState(false);
  const [lostConfirmOpen, setLostConfirmOpen] = useState(false);
  const [lostReason, setLostReason] = useState("");

  const [keyOwners, setKeyOwners] = useState<any[]>([]);
  const [keyOwnerOpen, setKeyOwnerOpen] = useState(false);
  const [keyOwnerUser, setKeyOwnerUser] = useState("");
  const [keyOwnerContact, setKeyOwnerContact] = useState("");
  const [keyOwnerNote, setKeyOwnerNote] = useState("");
  const [contacts, setContacts] = useState<any[]>([]);

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

    // โหลด key account owners (ถ้า account เป็น key account)
    if (leadData.account_id) {
      const [ownersRes, contactsRes] = await Promise.all([
        crmDb().from("key_account_owners")
          .select("id, user_id, contact_id, note, created_at, user:user_id(full_name), contact:contact_id(name, phone, line_id)")
          .eq("account_id", leadData.account_id),
        crmDb().from("contacts").select("id, name, phone, line_id, position").eq("account_id", leadData.account_id),
      ]);
      setKeyOwners(ownersRes.data ?? []);
      setContacts(contactsRes.data ?? []);
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

  const toggleKeyAccount = async () => {
    if (!account) return;
    const newVal = !account.is_key_account;
    const { error } = await crmDb().from("accounts").update({ is_key_account: newVal }).eq("id", account.id);
    if (error) { toast.error("อัปเดตไม่สำเร็จ"); return; }
    setAccount({ ...account, is_key_account: newVal });
    toast.success(newVal ? "เพิ่มเป็น Key Account แล้ว" : "ยกเลิก Key Account แล้ว");
  };

  const addKeyOwner = async () => {
    if (!keyOwnerUser || !account) return;
    const { error } = await crmDb().from("key_account_owners").insert({
      account_id: account.id,
      user_id: keyOwnerUser,
      contact_id: keyOwnerContact || null,
      note: keyOwnerNote || null,
    });
    if (error) {
      if (error.code === "23505") { toast.error("Sales คนนี้ดูแล Account นี้อยู่แล้ว"); }
      else { toast.error("เพิ่มไม่สำเร็จ"); }
      return;
    }
    toast.success("เพิ่ม Sales ดูแล Key Account แล้ว");
    setKeyOwnerOpen(false);
    setKeyOwnerUser(""); setKeyOwnerContact(""); setKeyOwnerNote("");
    load();
  };

  const removeKeyOwner = async (id: string) => {
    await crmDb().from("key_account_owners").delete().eq("id", id);
    toast.success("ลบออกแล้ว");
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
          <Button variant="outline" size="sm" onClick={() => setCallOpen(true)}>
            <Phone className="mr-1 h-4 w-4" /> โทรหา
          </Button>
          <Button variant="outline" size="sm" onClick={() => setLineOpen(true)}>
            <MessageCircle className="mr-1 h-4 w-4" /> ส่ง Line
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEmailOpen(true)}>
            <Mail className="mr-1 h-4 w-4" /> ส่งอีเมล
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
            className="border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/50"
            onClick={() => setWonConfirmOpen(true)}
          >
            <Trophy className="mr-1.5 h-3.5 w-3.5" /> ชนะ
          </Button>
          <Button
            size="sm"
            className="border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50"
            onClick={() => setLostConfirmOpen(true)}
          >
            <XCircle className="mr-1.5 h-3.5 w-3.5" /> แพ้
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
                    <X className="mr-1 h-3 w-3" /> ยกเลิก link
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

          <LeadEmailComposer
            open={emailOpen}
            onOpenChange={setEmailOpen}
            leadId={leadId}
            leadTitle={form.title}
            stage={form.stage}
            contactId={contact?.id}
            contactName={contact?.contact_name ?? contact?.name}
            contactEmail={contact?.email}
            companyName={account?.name}
            onSent={load}
          />

          <LeadQuotationsSection leadId={leadId} accountId={lead.account_id} />

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
          {account && (
            <div className="rounded-xl border bg-card p-4 space-y-3">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Crown className="h-4 w-4 text-amber-600" />
                  Key Account
                </div>
                <button
                  onClick={toggleKeyAccount}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    account.is_key_account
                      ? "bg-amber-100 text-amber-700 border border-amber-300 hover:bg-amber-200"
                      : "bg-muted text-muted-foreground border border-border hover:bg-muted/80"
                  }`}
                >
                  <Crown className="h-3 w-3" />
                  {account.is_key_account ? "Key Account ✓" : "ตั้งเป็น Key Account"}
                </button>
              </div>
              {account.is_key_account && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Sales ที่ดูแล {account.name}
                  </p>
                  {/* รายชื่อ Sales ที่ดูแล */}
                  <div className="space-y-2">
                    {keyOwners.map((ko) => (
                      <div key={ko.id} className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-700">
                          {(ko.user?.full_name ?? "?").slice(0, 1).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium">{ko.user?.full_name ?? "—"}</div>
                          {ko.contact?.name && (
                            <div className="text-[10px] text-muted-foreground">
                              Contact: {ko.contact.name}
                              {ko.contact.phone && ` · ${ko.contact.phone}`}
                            </div>
                          )}
                          {ko.note && <div className="text-[10px] text-muted-foreground mt-0.5">{ko.note}</div>}
                        </div>
                        {(role === "admin" || role === "manager") && (
                          <button
                            onClick={() => removeKeyOwner(ko.id)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    {keyOwners.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-2">
                        ยังไม่มี Sales ดูแล Account นี้
                      </p>
                    )}
                  </div>
                  {/* ปุ่มเพิ่ม Sales */}
                  {(role === "admin" || role === "manager") && (
                    <button
                      onClick={() => setKeyOwnerOpen(true)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-amber-300 py-2 text-xs text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                    >
                      <Plus className="h-3.5 w-3.5" /> เพิ่ม Sales ดูแล
                    </button>
                  )}
                </>
              )}
            </div>
          )}

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
              <Button size="sm" variant="outline" onClick={() => setCallOpen(true)}>
                <Phone className="mr-1 h-3.5 w-3.5" /> โทรหา
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLineOpen(true)}>
                <MessageCircle className="mr-1 h-3.5 w-3.5" /> ส่ง Line
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEmailOpen(true)}>
                <Mail className="mr-1 h-3.5 w-3.5" /> ส่งอีเมล
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

      <CallDialog
        open={callOpen}
        onOpenChange={setCallOpen}
        contactPhone={contact?.phone ?? null}
        leadId={lead.id}
        ownerId={user?.id ?? null}
        onLogged={load}
      />

      <LineDialog
        open={lineOpen}
        onOpenChange={setLineOpen}
        contactLineId={contact?.line_id ?? null}
        contactLineName={contact?.name ?? null}
        leadId={lead.id}
        ownerId={user?.id ?? null}
        onLogged={load}
      />

      <Dialog open={wonConfirmOpen} onOpenChange={setWonConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
              <Trophy className="h-5 w-5" /> ยืนยันปิดดีล "ชนะ"
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ดีลนี้จะถูกย้ายไปที่ <span className="font-semibold text-emerald-700">ชนะ</span> และบันทึกเป็นยอดขายสำเร็จ
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setWonConfirmOpen(false)}>ยกเลิก</Button>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => { setWonConfirmOpen(false); changeStage("won"); }}
            >
              <Trophy className="mr-1.5 h-4 w-4" /> ยืนยัน ชนะ!
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={lostConfirmOpen} onOpenChange={setLostConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <XCircle className="h-5 w-5" /> ยืนยันปิดดีล "แพ้"
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">
            โปรดระบุสาเหตุที่แพ้ เพื่อใช้ปรับปรุงกลยุทธ์การขายในอนาคต
          </p>
          <div>
            <Label className="text-xs">สาเหตุที่แพ้ <span className="text-muted-foreground">(optional)</span></Label>
            <Select value={lostReason} onValueChange={setLostReason}>
              <SelectTrigger>
                <SelectValue placeholder="เลือกสาเหตุ..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="price">ราคาสูงเกินไป</SelectItem>
                <SelectItem value="competitor">เลือกคู่แข่ง</SelectItem>
                <SelectItem value="budget">ไม่มีงบประมาณ</SelectItem>
                <SelectItem value="timing">ยังไม่พร้อมซื้อ</SelectItem>
                <SelectItem value="spec">สเปคไม่ตรงความต้องการ</SelectItem>
                <SelectItem value="contact_lost">ติดต่อไม่ได้</SelectItem>
                <SelectItem value="other">อื่นๆ</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setLostConfirmOpen(false)}>ยกเลิก</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                setLostConfirmOpen(false);
                await changeStage("lost");
                if (lostReason) {
                  await crmDb().from("leads").update({ lost_reason: lostReason }).eq("id", lead.id);
                }
                setLostReason("");
              }}
            >
              <XCircle className="mr-1.5 h-4 w-4" /> ยืนยัน แพ้
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={keyOwnerOpen} onOpenChange={setKeyOwnerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-amber-600" /> เพิ่ม Sales ดูแล Key Account
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Sales ที่รับผิดชอบ <span className="text-red-500">*</span></Label>
              <Select value={keyOwnerUser || "none"} onValueChange={(v) => setKeyOwnerUser(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="เลือก Sales..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— เลือก Sales —</SelectItem>
                  {profiles.filter(p => p.is_active).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.id.slice(0, 8)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Contact ที่ดูแล (optional)</Label>
              <Select value={keyOwnerContact || "none"} onValueChange={(v) => setKeyOwnerContact(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="เลือก Contact..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.position ? ` (${c.position})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Contact คนละคนสำหรับ Sales แต่ละคนในองค์กรใหญ่
              </p>
            </div>
            <div>
              <Label className="text-xs">หมายเหตุ</Label>
              <Textarea
                rows={2}
                placeholder="เช่น ดูแลฝ่าย IT, ติดต่อด้านจัดซื้อ..."
                value={keyOwnerNote}
                onChange={(e) => setKeyOwnerNote(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setKeyOwnerOpen(false)}>ยกเลิก</Button>
              <Button onClick={addKeyOwner} disabled={!keyOwnerUser}
                className="bg-amber-600 hover:bg-amber-700 text-white">
                เพิ่ม Sales
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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

function CallDialog({ open, onOpenChange, contactPhone, leadId, ownerId, onLogged }: { open: boolean; onOpenChange: (v: boolean) => void; contactPhone: string | null; leadId: string; ownerId: string | null; onLogged: () => void }) {
  const [body, setBody] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [createFollowup, setCreateFollowup] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await crmDb().from("activities").insert({
      lead_id: leadId,
      type: "call",
      subject: "โทรติดตาม",
      body: body.trim() || null,
      due_at: dueAt || null,
      done: true,
      done_at: new Date().toISOString(),
      owner_id: ownerId,
    });
    if (createFollowup && dueAt) {
      await crmDb().from("activities").insert({
        lead_id: leadId,
        type: "call",
        subject: "Follow-up โทร",
        done: false,
        due_at: dueAt,
        owner_id: ownerId,
      });
    }
    setSaving(false);
    setBody("");
    setDueAt("");
    setCreateFollowup(false);
    onOpenChange(false);
    onLogged();
    toast.success("บันทึกผลการโทรแล้ว");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>บันทึกการโทร</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {contactPhone && (
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
              <span className="text-sm font-medium">{contactPhone}</span>
              <a href={`tel:${contactPhone}`} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
                <Phone className="h-3.5 w-3.5" /> โทรเลย
              </a>
            </div>
          )}
          <div>
            <Label className="text-xs">ผลการโทร / บันทึก</Label>
            <Textarea rows={5} placeholder="สรุปการสนทนา..." value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">นัดหมายครั้งต่อไป</Label>
            <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="create-followup"
              checked={createFollowup}
              onChange={e => setCreateFollowup(e.target.checked)}
            />
            <label htmlFor="create-followup" className="text-xs text-muted-foreground cursor-pointer">
              สร้างกิจกรรม follow-up อัตโนมัติ
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              บันทึก
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LineDialog({ open, onOpenChange, contactLineId, contactLineName, leadId, ownerId, onLogged }: { open: boolean; onOpenChange: (v: boolean) => void; contactLineId: string | null; contactLineName: string | null; leadId: string; ownerId: string | null; onLogged: () => void }) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await crmDb().from("activities").insert({
      lead_id: leadId,
      type: "line",
      subject: "ส่ง Line ติดตาม",
      body: body.trim() || null,
      done: true,
      done_at: new Date().toISOString(),
      owner_id: ownerId,
    });
    setSaving(false);
    setBody("");
    onOpenChange(false);
    onLogged();
    toast.success("บันทึกการส่ง Line แล้ว");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>ส่ง LINE</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {contactLineId && (
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
              <span className="text-sm font-medium">{contactLineName ?? contactLineId ?? "ไม่ทราบ LINE ID"}</span>
              <a
                href={`https://line.me/ti/p/~${contactLineId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md bg-[#06C755] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#05a847]"
              >
                <MessageCircle className="h-3.5 w-3.5" /> เปิด LINE
              </a>
            </div>
          )}
          {contactLineId && <p className="text-xs text-muted-foreground">LINE: {contactLineId}</p>}
          <div>
            <Label className="text-xs">บันทึกข้อความที่ส่ง</Label>
            <Textarea rows={3} placeholder="สรุปข้อความที่ส่งไป..." value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              บันทึก
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
