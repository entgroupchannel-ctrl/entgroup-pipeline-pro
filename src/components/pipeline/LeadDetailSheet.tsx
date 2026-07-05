import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, ExternalLink, Phone, Mail, MessageCircle, Users, FileText,
  ArrowUpRight, CheckCircle2, Clock, AlertTriangle, Plus, Send,
} from "lucide-react";
import { toast } from "sonner";
import { crmDb, ACTIVE_STAGES, OUTCOME_STAGES, STAGE_LABEL_TH, type Lead, type LeadStage } from "@/lib/crm";
import { formatBaht, formatThaiDate } from "@/lib/format";
import { activityIcon, ACTIVITY_TYPE_LABEL, type Activity, type ActivityType } from "@/lib/activities";
import { useAuth } from "@/lib/auth-context";
import { ActivityLogDialog, type ActivityKind } from "@/components/activities/ActivityLogDialog";

// ── helpers ───────────────────────────────────────────────────────────────────

function isOverdue(due_at: string) {
  return new Date(due_at).getTime() < Date.now();
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "เมื่อกี้";
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชั่วโมงที่แล้ว`;
  return `${Math.floor(h / 24)} วันที่แล้ว`;
}

function getActivityPreview(a: Activity): string {
  if (!a.body) return "";
  try {
    const p = JSON.parse(a.body);
    return p.issues ?? p.next_action ?? p.topic ?? p.decision ?? "";
  } catch {
    return a.body.slice(0, 80);
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  leadId: string | null;
  onClose: () => void;
  onChanged: () => void;
}

// ── Main Sheet ────────────────────────────────────────────────────────────────

export function LeadDetailSheet({ leadId, onClose, onChanged }: Props) {
  const { user } = useAuth();
  const [lead, setLead] = useState<any | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("overview");
  const [quickNote, setQuickNote] = useState("");
  const [postingNote, setPostingNote] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logKind, setLogKind] = useState<ActivityKind>("call");

  const [form, setForm] = useState({
    title: "",
    expected_value: "",
    expected_close_date: "",
    flowaccount_quotation_no: "",
    flowaccount_quotation_url: "",
    stage: "new" as LeadStage,
    lost_reason: "",
    source: "",
  });

  const load = async () => {
    if (!leadId) { setLead(null); setActivities([]); return; }
    setLoading(true);
    const { data: leadData, error } = await crmDb()
      .from("leads").select("*").eq("id", leadId).maybeSingle();
    if (error || !leadData) { setLoading(false); return; }

    const [accountRes, contactRes, actsRes] = await Promise.all([
      leadData.account_id
        ? crmDb().from("accounts").select("id,name,phone,website").eq("id", leadData.account_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
      leadData.contact_id
        ? crmDb().from("contacts").select("id,name,nickname,position,phone,email,line_id,birth_date").eq("id", leadData.contact_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
      crmDb().from("activities").select("*").eq("lead_id", leadId)
        .order("created_at", { ascending: false }).limit(20),
    ]);

    setLead({ ...leadData, account: accountRes.data ?? null, contact: contactRes.data ?? null });
    setActivities((actsRes.data ?? []) as Activity[]);
    setForm({
      title: leadData.title ?? "",
      expected_value: leadData.expected_value != null ? String(leadData.expected_value) : "",
      expected_close_date: leadData.expected_close_date ?? "",
      flowaccount_quotation_no: leadData.flowaccount_quotation_no ?? "",
      flowaccount_quotation_url: leadData.flowaccount_quotation_url ?? "",
      stage: (leadData.stage as LeadStage) ?? "new",
      lost_reason: leadData.lost_reason ?? "",
      source: leadData.source ?? "",
    });
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [leadId]);

  const save = async () => {
    if (!lead) return;
    setSaving(true);
    const { error } = await crmDb().from("leads").update({
      title: form.title,
      expected_value: form.expected_value ? Number(form.expected_value) : null,
      expected_close_date: form.expected_close_date || null,
      flowaccount_quotation_no: form.flowaccount_quotation_no || null,
      flowaccount_quotation_url: form.flowaccount_quotation_url || null,
      stage: form.stage,
      lost_reason: form.stage === "lost" ? form.lost_reason || null : null,
      source: form.source || null,
    }).eq("id", lead.id);
    setSaving(false);
    if (error) { toast.error("บันทึกไม่สำเร็จ", { description: error.message }); return; }
    toast.success("บันทึกแล้ว");
    onChanged();
  };

  const changeStage = async (next: LeadStage) => {
    if (!lead || next === form.stage) return;
    const prev = form.stage;
    setForm((f) => ({ ...f, stage: next }));
    const { error } = await crmDb().from("leads").update({ stage: next }).eq("id", lead.id);
    if (error) {
      toast.error("เปลี่ยน stage ไม่สำเร็จ");
      setForm((f) => ({ ...f, stage: prev }));
      return;
    }
    // Auto-log stage change
    await crmDb().from("activities").insert({
      lead_id: lead.id, type: "note",
      subject: `เปลี่ยน stage: ${STAGE_LABEL_TH[prev]} → ${STAGE_LABEL_TH[next]}`,
      done: true, done_at: new Date().toISOString(), owner_id: user?.id,
    });
    toast.success(`เปลี่ยนเป็น ${STAGE_LABEL_TH[next]} แล้ว`);
    onChanged();
    load();
  };

  const postQuickNote = async () => {
    if (!quickNote.trim() || !lead) return;
    setPostingNote(true);
    const { error } = await crmDb().from("activities").insert({
      lead_id: lead.id, type: "note", subject: quickNote.trim(),
      done: true, done_at: new Date().toISOString(), owner_id: user?.id,
    });
    setPostingNote(false);
    if (error) { toast.error("บันทึกไม่สำเร็จ"); return; }
    setQuickNote("");
    load();
  };

  const toggleDone = async (a: Activity, done: boolean) => {
    await crmDb().from("activities")
      .update({ done, done_at: done ? new Date().toISOString() : null }).eq("id", a.id);
    load();
  };

  const pendingActs = activities.filter((a) => !a.done);
  const overdueCount = pendingActs.filter((a) => a.due_at && isOverdue(a.due_at)).length;

  return (
    <>
      <Sheet open={!!leadId} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full overflow-hidden flex flex-col p-0 sm:max-w-[520px]">
          {/* Header */}
          <div className="border-b px-5 py-4 shrink-0">
            <SheetHeader className="mb-0">
              <SheetTitle className="text-base">
                {loading ? "กำลังโหลด..." : lead?.deal_number ?? lead?.title ?? "รายละเอียดดีล"}
              </SheetTitle>
            </SheetHeader>
            {lead && !loading && (
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold stage-badge-${form.stage}`}>
                  {STAGE_LABEL_TH[form.stage]}
                </span>
                {lead.account?.name && (
                  <span className="text-xs text-muted-foreground">{lead.account.name}</span>
                )}
                {overdueCount > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                    <AlertTriangle className="h-3 w-3" /> {overdueCount} เลยกำหนด
                  </span>
                )}
                <Link
                  to="/leads/$leadId"
                  params={{ leadId: lead.id }}
                  className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline"
                  onClick={onClose}
                >
                  เปิดเต็มจอ <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </div>

          {loading || !lead ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col overflow-hidden">
              <TabsList className="shrink-0 mx-5 mt-3 grid grid-cols-3 w-auto">
                <TabsTrigger value="overview">ภาพรวม</TabsTrigger>
                <TabsTrigger value="activities" className="relative">
                  กิจกรรม
                  {pendingActs.length > 0 && (
                    <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                      {pendingActs.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="edit">แก้ไข</TabsTrigger>
              </TabsList>

              {/* ── Overview tab ── */}
              <TabsContent value="overview" className="flex-1 overflow-y-auto px-5 pb-5 pt-4 space-y-4">

                {/* Stage quick-change */}
                <div>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">เปลี่ยน Stage</div>
                  <div className="flex flex-wrap gap-1.5">
                    {[...ACTIVE_STAGES, ...OUTCOME_STAGES].map((s) => (
                      <button
                        key={s}
                        onClick={() => changeStage(s)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          form.stage === s
                            ? `stage-badge-${s} opacity-100`
                            : "border bg-background hover:bg-muted opacity-60 hover:opacity-100"
                        }`}
                      >
                        {STAGE_LABEL_TH[s]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Value + date KPI */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border bg-card p-3">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">มูลค่า</div>
                    <div className="mt-1 text-lg font-semibold">{formatBaht(Number(form.expected_value || 0))}</div>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">วันปิดคาดหวัง</div>
                    <div className="mt-1 text-sm font-medium">
                      {form.expected_close_date ? formatThaiDate(form.expected_close_date) : "—"}
                    </div>
                  </div>
                </div>

                {/* Contact card */}
                {lead.contact && (
                  <div className="rounded-lg border bg-card p-3 space-y-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">ผู้ติดต่อ</div>
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {lead.contact.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium">
                          {lead.contact.name}
                          {lead.contact.nickname && <span className="ml-1 text-xs text-muted-foreground">({lead.contact.nickname})</span>}
                        </div>
                        {lead.contact.position && <div className="text-xs text-muted-foreground">{lead.contact.position}</div>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 pt-0.5">
                      {lead.contact.phone && (
                        <a href={`tel:${lead.contact.phone}`} className="flex items-center gap-1 text-xs text-primary hover:underline">
                          <Phone className="h-3 w-3" />{lead.contact.phone}
                        </a>
                      )}
                      {lead.contact.email && (
                        <a href={`mailto:${lead.contact.email}`} className="flex items-center gap-1 text-xs text-primary hover:underline">
                          <Mail className="h-3 w-3" />{lead.contact.email}
                        </a>
                      )}
                      {lead.contact.line_id && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MessageCircle className="h-3 w-3" />{lead.contact.line_id}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Quick-log buttons */}
                <div>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">บันทึกกิจกรรมด่วน</div>
                  <div className="flex gap-2 flex-wrap">
                    {([
                      { kind: "call",    icon: Phone,         label: "โทร" },
                      { kind: "line",    icon: MessageCircle, label: "LINE" },
                      { kind: "meeting", icon: Users,         label: "เข้าพบ" },
                      { kind: "email",   icon: Mail,          label: "อีเมล" },
                      { kind: "note",    icon: FileText,      label: "โน้ต" },
                    ] as { kind: ActivityKind; icon: React.ElementType; label: string }[]).map(({ kind, icon: Icon, label }) => (
                      <button
                        key={kind}
                        onClick={() => { setLogKind(kind); setLogOpen(true); }}
                        className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                      >
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Recent activities preview */}
                <div>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">กิจกรรมล่าสุด</div>
                  {activities.length === 0 ? (
                    <div className="rounded-lg border border-dashed py-4 text-center text-xs text-muted-foreground">
                      ยังไม่มีกิจกรรม
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {activities.slice(0, 4).map((a) => {
                        const Icon = activityIcon(a.type);
                        const preview = getActivityPreview(a);
                        return (
                          <div key={a.id} className={`flex items-start gap-2 rounded-lg px-2.5 py-2 ${a.done ? "opacity-60" : "border"}`}>
                            <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${!a.done && a.due_at && isOverdue(a.due_at) ? "text-red-500" : "text-muted-foreground"}`} />
                            <div className="min-w-0 flex-1">
                              <div className={`text-xs font-medium ${a.done ? "line-through text-muted-foreground" : ""}`}>
                                {a.subject}
                              </div>
                              {preview && <div className="truncate text-[10px] text-muted-foreground italic">{preview}</div>}
                              <div className="text-[10px] text-muted-foreground">
                                {a.done ? `เสร็จ ${timeAgo(a.done_at ?? a.created_at)}` : a.due_at ? formatThaiDate(a.due_at) : "ไม่มีกำหนด"}
                              </div>
                            </div>
                            {!a.done && (
                              <button
                                onClick={() => toggleDone(a, true)}
                                className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-emerald-600"
                                title="ทำเสร็จแล้ว"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                      {activities.length > 4 && (
                        <button onClick={() => setTab("activities")} className="w-full pt-1 text-center text-xs text-primary hover:underline">
                          ดูทั้งหมด {activities.length} กิจกรรม →
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Quick note */}
                <div>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">โน้ตด่วน</div>
                  <div className="flex gap-2">
                    <Input
                      value={quickNote}
                      onChange={(e) => setQuickNote(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); postQuickNote(); } }}
                      placeholder="กด Enter เพื่อบันทึก…"
                      className="text-sm"
                    />
                    <Button size="icon" onClick={postQuickNote} disabled={postingNote || !quickNote.trim()}>
                      {postingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {/* FlowAccount link */}
                {(form.flowaccount_quotation_no || form.flowaccount_quotation_url) && (
                  <div className="flex items-center gap-2 rounded-lg border bg-amber-50 px-3 py-2 dark:bg-amber-950/20">
                    <FileText className="h-4 w-4 shrink-0 text-amber-600" />
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-300">{form.flowaccount_quotation_no}</span>
                    {form.flowaccount_quotation_url && (
                      <a href={form.flowaccount_quotation_url} target="_blank" rel="noreferrer" className="ml-auto text-xs text-primary hover:underline">
                        เปิด ↗
                      </a>
                    )}
                  </div>
                )}
              </TabsContent>

              {/* ── Activities tab ── */}
              <TabsContent value="activities" className="flex-1 overflow-y-auto px-5 pb-5 pt-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium">{activities.length} กิจกรรม</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { setLogKind("call"); setLogOpen(true); }}>
                    <Plus className="h-3.5 w-3.5" /> เพิ่ม
                  </Button>
                </div>
                {activities.length === 0 ? (
                  <div className="rounded-xl border border-dashed py-10 text-center text-xs text-muted-foreground">
                    ยังไม่มีกิจกรรม — กดเพิ่มได้เลย
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activities.map((a) => {
                      const Icon = activityIcon(a.type);
                      const overdue = !a.done && !!a.due_at && isOverdue(a.due_at);
                      const preview = getActivityPreview(a);
                      return (
                        <div
                          key={a.id}
                          className={`rounded-lg border px-3 py-2.5 ${overdue ? "border-l-4 border-l-red-500 bg-red-50/30 dark:bg-red-950/10" : ""} ${a.done ? "opacity-60" : ""}`}
                        >
                          <div className="flex items-start gap-2">
                            <Checkbox checked={a.done} onCheckedChange={(v) => toggleDone(a, !!v)} className="mt-0.5" />
                            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${overdue ? "text-red-500" : "text-muted-foreground"}`} />
                            <div className="min-w-0 flex-1">
                              <div className={`text-sm font-medium ${a.done ? "line-through" : ""}`}>{a.subject}</div>
                              {preview && (
                                <div className="mt-0.5 text-xs text-muted-foreground italic line-clamp-2">{preview}</div>
                              )}
                              <div className={`mt-0.5 text-[11px] ${overdue ? "font-semibold text-red-600" : "text-muted-foreground"}`}>
                                {ACTIVITY_TYPE_LABEL[a.type as ActivityType] ?? a.type} ·{" "}
                                {a.done
                                  ? `เสร็จ ${timeAgo(a.done_at ?? a.created_at)}`
                                  : a.due_at
                                  ? formatThaiDate(a.due_at)
                                  : timeAgo(a.created_at)}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              {/* ── Edit tab ── */}
              <TabsContent value="edit" className="flex-1 overflow-y-auto px-5 pb-5 pt-4 space-y-4">
                <div>
                  <Label className="text-xs">ชื่อดีล</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">มูลค่าคาดหวัง (บาท)</Label>
                    <Input type="number" value={form.expected_value} onChange={(e) => setForm({ ...form, expected_value: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">วันปิดคาดหวัง</Label>
                    <Input type="date" value={form.expected_close_date} onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">ที่มา</Label>
                  <Select value={form.source || "none"} onValueChange={(v) => setForm({ ...form, source: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="เลือกที่มา" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">ไม่ระบุ</SelectItem>
                      <SelectItem value="line_oa">LINE OA</SelectItem>
                      <SelectItem value="website">เว็บไซต์</SelectItem>
                      <SelectItem value="referral">แนะนำ</SelectItem>
                      <SelectItem value="key_account">Key Account</SelectItem>
                      <SelectItem value="flowaccount">FlowAccount</SelectItem>
                      <SelectItem value="other">อื่นๆ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">เลขที่ใบเสนอราคา FA</Label>
                  <div className="flex gap-2">
                    <Input value={form.flowaccount_quotation_no} onChange={(e) => setForm({ ...form, flowaccount_quotation_no: e.target.value })} placeholder="QT-2025-001" />
                    {form.flowaccount_quotation_url && (
                      <Button variant="outline" size="icon" asChild>
                        <a href={form.flowaccount_quotation_url} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                  <Input className="mt-1.5" value={form.flowaccount_quotation_url} onChange={(e) => setForm({ ...form, flowaccount_quotation_url: e.target.value })} placeholder="ลิงก์ URL" />
                </div>
                {form.stage === "lost" && (
                  <div>
                    <Label className="text-xs">เหตุผลที่แพ้ดีล</Label>
                    <Textarea value={form.lost_reason} onChange={(e) => setForm({ ...form, lost_reason: e.target.value })} rows={3} />
                  </div>
                )}
                <div className="flex justify-end gap-2 border-t pt-3">
                  <Button variant="outline" size="sm" onClick={onClose}>ยกเลิก</Button>
                  <Button size="sm" onClick={save} disabled={saving}>
                    {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                    บันทึก
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </SheetContent>
      </Sheet>

      <ActivityLogDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        leadId={lead?.id ?? null}
        defaultKind={logKind}
        onSaved={() => { setLogOpen(false); load(); }}
      />
    </>
  );
}
