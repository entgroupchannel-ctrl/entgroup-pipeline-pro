import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft, Building2, Loader2, Plus, Save, ExternalLink, Phone, Mail,
  MessageCircle, Trash2, Crown, Cake, CalendarDays, Star, Users,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { crmDb, STAGE_LABEL_TH, ACTIVE_STAGES, type LeadStage } from "@/lib/crm";
import { formatBaht, formatThaiDate } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/accounts/$accountId")({
  component: AccountDetailPage,
});

// ── Types ────────────────────────────────────────────────────────────────────

interface Account {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  owner_id: string | null;
  is_key_account: boolean;
  key_account_note: string | null;
  // new date fields
  founded_date: string | null;
  fiscal_year_end_month: number | null;
  customer_since: string | null;
  employee_count: string | null;
  annual_revenue_range: string | null;
  created_at: string;
  updated_at: string;
}

interface Contact {
  id: string;
  account_id: string;
  name: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  line_id: string | null;
  // new fields
  birth_date: string | null;
  birth_year: number | null;
  nickname: string | null;
  gender: string | null;
  personal_notes: string | null;
  created_at: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STAGE_COLOR: Record<LeadStage, string> = {
  new:          "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  qualified:    "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  proposal:     "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  negotiation:  "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  closing:      "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  won:          "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  lost:         "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

const MONTHS_TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

/** วันที่เหลือถึงวันสำคัญถัดไป (birthday / anniversary แบบ recurring) */
function daysUntilNextOccurrence(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const thisYear = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  const diff = thisYear.getTime() - now.setHours(0,0,0,0);
  if (diff >= 0) return Math.round(diff / 86400000);
  // ปีหน้า
  const nextYear = new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
  return Math.round((nextYear.getTime() - Date.now()) / 86400000);
}

function DaysUntilBadge({ days }: { days: number | null }) {
  if (days === null) return null;
  const color =
    days === 0  ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300" :
    days <= 7   ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" :
    days <= 30  ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" :
                  "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  const label = days === 0 ? "วันนี้! 🎉" : days === 1 ? "พรุ่งนี้" : `อีก ${days} วัน`;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${color}`}>
      {label}
    </span>
  );
}

function formatDateTH(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${MONTHS_TH[d.getMonth()]} ${d.getFullYear() + 543}`;
}

// ── Main Page ────────────────────────────────────────────────────────────────

function AccountDetailPage() {
  const { accountId } = Route.useParams();
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const isManager = role === "manager" || role === "admin";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [contactOpen, setContactOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);

  const [form, setForm] = useState({
    name: "", industry: "", website: "", phone: "", address: "",
    is_key_account: false, key_account_note: "",
    // date intelligence
    founded_date: "",
    fiscal_year_end_month: "",
    customer_since: "",
    employee_count: "",
    annual_revenue_range: "",
  });

  const load = async () => {
    setLoading(true);
    const [accRes, contactsRes, leadsRes] = await Promise.all([
      crmDb().from("accounts").select("*").eq("id", accountId).maybeSingle(),
      crmDb().from("contacts").select("*").eq("account_id", accountId).order("name"),
      crmDb().from("leads").select("*").eq("account_id", accountId).order("updated_at", { ascending: false }),
    ]);
    if (accRes.error || !accRes.data) {
      toast.error("โหลดข้อมูลบริษัทไม่สำเร็จ");
      setLoading(false);
      return;
    }
    const acc = accRes.data as Account;
    setAccount(acc);
    setContacts((contactsRes.data ?? []) as Contact[]);
    setLeads(leadsRes.data ?? []);
    setForm({
      name: acc.name,
      industry: acc.industry ?? "",
      website: acc.website ?? "",
      phone: acc.phone ?? "",
      address: acc.address ?? "",
      is_key_account: acc.is_key_account ?? false,
      key_account_note: acc.key_account_note ?? "",
      founded_date: acc.founded_date ?? "",
      fiscal_year_end_month: acc.fiscal_year_end_month != null ? String(acc.fiscal_year_end_month) : "",
      customer_since: acc.customer_since ?? "",
      employee_count: acc.employee_count ?? "",
      annual_revenue_range: acc.annual_revenue_range ?? "",
    });
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [accountId]);

  const save = async () => {
    if (!form.name.trim()) return toast.error("กรุณาระบุชื่อบริษัท");
    setSaving(true);
    const { error } = await crmDb().from("accounts").update({
      name: form.name.trim(),
      industry: form.industry.trim() || null,
      website: form.website.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      is_key_account: form.is_key_account,
      key_account_note: form.key_account_note.trim() || null,
      founded_date: form.founded_date || null,
      fiscal_year_end_month: form.fiscal_year_end_month ? Number(form.fiscal_year_end_month) : null,
      customer_since: form.customer_since || null,
      employee_count: form.employee_count || null,
      annual_revenue_range: form.annual_revenue_range || null,
    }).eq("id", accountId);
    setSaving(false);
    if (error) return toast.error("บันทึกไม่สำเร็จ", { description: error.message });
    toast.success("บันทึกแล้ว");
    load();
  };

  const deleteContact = async (id: string) => {
    const { error } = await crmDb().from("contacts").delete().eq("id", id);
    if (error) return toast.error("ลบไม่สำเร็จ", { description: error.message });
    toast.success("ลบผู้ติดต่อแล้ว");
    load();
  };

  if (loading || !account) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeLeads = leads.filter((l) => ACTIVE_STAGES.includes(l.stage));
  const pipeline = activeLeads.reduce((s: number, l: any) => s + (l.expected_value ?? 0), 0);

  // upcoming events for this account
  const companyAnnivDays = daysUntilNextOccurrence(form.founded_date);
  const customerAnnivDays = daysUntilNextOccurrence(form.customer_since);
  const upcomingContacts = contacts
    .map((c) => ({ ...c, days: daysUntilNextOccurrence(c.birth_date) }))
    .filter((c) => c.days !== null && c.days <= 30)
    .sort((a, b) => (a.days ?? 999) - (b.days ?? 999));

  return (
    <div className="flex h-full flex-col page-fade-in">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-6 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/accounts" })}>
            <ArrowLeft className="mr-1 h-4 w-4" /> บริษัท
          </Button>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold">{account.name}</h1>
            {form.is_key_account && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                <Crown className="h-3 w-3" /> Key Account
              </span>
            )}
          </div>
          {account.industry && (
            <Badge variant="secondary" className="text-xs">{account.industry}</Badge>
          )}
        </div>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          บันทึก
        </Button>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-6 overflow-auto p-6 lg:flex-row">

        {/* LEFT — company info */}
        <div className="space-y-5 lg:w-[360px] lg:shrink-0">

          {/* KPI mini */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border bg-card p-4">
              <div className="text-xs text-muted-foreground">ดีล Active</div>
              <div className="mt-1 text-2xl font-bold">{activeLeads.length}</div>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <div className="text-xs text-muted-foreground">Pipeline</div>
              <div className="mt-1 text-lg font-bold">{formatBaht(pipeline)}</div>
            </div>
          </div>

          {/* Upcoming events mini-banner */}
          {(upcomingContacts.length > 0 || (companyAnnivDays !== null && companyAnnivDays <= 30) || (customerAnnivDays !== null && customerAnnivDays <= 30)) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1.5 dark:border-amber-900/40 dark:bg-amber-950/20">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                <Star className="h-3.5 w-3.5" /> เหตุการณ์สำคัญใน 30 วัน
              </div>
              {companyAnnivDays !== null && companyAnnivDays <= 30 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                    <CalendarDays className="h-3 w-3" /> ครบรอบก่อตั้ง ({formatDateTH(form.founded_date)})
                  </span>
                  <DaysUntilBadge days={companyAnnivDays} />
                </div>
              )}
              {customerAnnivDays !== null && customerAnnivDays <= 30 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                    <Star className="h-3 w-3" /> ครบรอบลูกค้า ({formatDateTH(form.customer_since)})
                  </span>
                  <DaysUntilBadge days={customerAnnivDays} />
                </div>
              )}
              {upcomingContacts.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                    <Cake className="h-3 w-3" /> วันเกิด {c.nickname ?? c.name}
                  </span>
                  <DaysUntilBadge days={c.days} />
                </div>
              ))}
            </div>
          )}

          {/* Company form */}
          <section className="rounded-xl border bg-card p-5 space-y-3">
            <h2 className="text-sm font-semibold">ข้อมูลบริษัท</h2>
            <div>
              <Label className="text-xs">ชื่อบริษัท <span className="text-red-500">*</span></Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} onBlur={save} />
            </div>
            <div>
              <Label className="text-xs">อุตสาหกรรม</Label>
              <Input placeholder="เช่น อาหาร, IT" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} onBlur={save} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">จำนวนพนักงาน</Label>
                <Select value={form.employee_count || "none"} onValueChange={(v) => { setForm({ ...form, employee_count: v === "none" ? "" : v }); }}>
                  <SelectTrigger><SelectValue placeholder="เลือก" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                    <SelectItem value="1-10">1–10 คน</SelectItem>
                    <SelectItem value="11-50">11–50 คน</SelectItem>
                    <SelectItem value="51-200">51–200 คน</SelectItem>
                    <SelectItem value="200+">200+ คน</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">รายได้ต่อปี (ประมาณ)</Label>
                <Select value={form.annual_revenue_range || "none"} onValueChange={(v) => { setForm({ ...form, annual_revenue_range: v === "none" ? "" : v }); }}>
                  <SelectTrigger><SelectValue placeholder="เลือก" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                    <SelectItem value="<5M">น้อยกว่า 5 ล้าน</SelectItem>
                    <SelectItem value="5-50M">5–50 ล้าน</SelectItem>
                    <SelectItem value="50-500M">50–500 ล้าน</SelectItem>
                    <SelectItem value="500M+">500 ล้านขึ้นไป</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">เว็บไซต์</Label>
              <div className="flex items-center gap-2">
                <Input placeholder="example.com" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} onBlur={save} />
                {form.website && (
                  <a href={form.website.startsWith("http") ? form.website : `https://${form.website}`} target="_blank" rel="noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs">โทรศัพท์</Label>
              <Input placeholder="02-xxx-xxxx" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} onBlur={save} />
            </div>
            <div>
              <Label className="text-xs">ที่อยู่</Label>
              <Input placeholder="ที่อยู่บริษัท" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} onBlur={save} />
            </div>

            {/* Key Account toggle */}
            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1.5">
                  <Crown className="h-3.5 w-3.5 text-amber-500" /> Key Account (VIP)
                </Label>
                <Switch checked={form.is_key_account} onCheckedChange={(v) => { setForm({ ...form, is_key_account: v }); }} />
              </div>
              {form.is_key_account && (
                <Input
                  placeholder="หมายเหตุ Key Account"
                  value={form.key_account_note}
                  onChange={(e) => setForm({ ...form, key_account_note: e.target.value })}
                  onBlur={save}
                />
              )}
            </div>
            <div className="pt-1 text-[11px] text-muted-foreground">
              สร้างเมื่อ {formatThaiDate(account.created_at)}
            </div>
          </section>

          {/* ── วันสำคัญของบริษัท ── */}
          <section className="rounded-xl border bg-card p-5 space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" /> วันสำคัญของบริษัท
            </h2>

            <div>
              <Label className="text-xs flex items-center justify-between">
                <span>วันก่อตั้งบริษัท</span>
                {form.founded_date && (
                  <span className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">{formatDateTH(form.founded_date)}</span>
                    <DaysUntilBadge days={daysUntilNextOccurrence(form.founded_date)} />
                  </span>
                )}
              </Label>
              <Input type="date" value={form.founded_date} onChange={(e) => setForm({ ...form, founded_date: e.target.value })} onBlur={save} />
              {form.founded_date && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  ก่อตั้งมาแล้ว {new Date().getFullYear() - new Date(form.founded_date).getFullYear()} ปี
                </p>
              )}
            </div>

            <div>
              <Label className="text-xs flex items-center justify-between">
                <span>วันแรกที่เป็นลูกค้า ENTGROUP</span>
                {form.customer_since && (
                  <span className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">{formatDateTH(form.customer_since)}</span>
                    <DaysUntilBadge days={daysUntilNextOccurrence(form.customer_since)} />
                  </span>
                )}
              </Label>
              <Input type="date" value={form.customer_since} onChange={(e) => setForm({ ...form, customer_since: e.target.value })} onBlur={save} />
              {form.customer_since && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  เป็นลูกค้ามา {new Date().getFullYear() - new Date(form.customer_since).getFullYear()} ปี
                </p>
              )}
            </div>

            <div>
              <Label className="text-xs">เดือนปิดงบการเงิน (Fiscal Year End)</Label>
              <Select value={form.fiscal_year_end_month || "none"} onValueChange={(v) => { setForm({ ...form, fiscal_year_end_month: v === "none" ? "" : v }); setTimeout(save, 100); }}>
                <SelectTrigger>
                  <SelectValue placeholder="เลือกเดือน" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                  {MONTHS_TH.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{m} (เดือนที่ {i + 1})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.fiscal_year_end_month && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  ควรติดตามก่อนปิดงบ — ลูกค้ามักมีงบสำหรับซื้อสินค้าก่อนสิ้นปีงบ
                </p>
              )}
            </div>
          </section>
        </div>

        {/* RIGHT — contacts + leads */}
        <div className="flex-1 space-y-6">

          {/* Contacts */}
          <section className="rounded-xl border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">ผู้ติดต่อ</h2>
                {contacts.length > 0 && (
                  <Badge variant="secondary" className="h-5 text-[10px]">{contacts.length}</Badge>
                )}
              </div>
              <Button size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => { setEditContact(null); setContactOpen(true); }}>
                <Plus className="h-3.5 w-3.5" /> เพิ่ม
              </Button>
            </div>

            {contacts.length === 0 ? (
              <div className="rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
                ยังไม่มีผู้ติดต่อ
              </div>
            ) : (
              <ul className="divide-y rounded-lg border overflow-hidden">
                {contacts.map((c) => {
                  const bDays = daysUntilNextOccurrence(c.birth_date);
                  const showBirthBadge = bDays !== null && bDays <= 30;
                  return (
                    <li key={c.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {c.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{c.name}</span>
                          {c.nickname && <span className="text-xs text-muted-foreground">({c.nickname})</span>}
                          {showBirthBadge && <DaysUntilBadge days={bDays} />}
                          {bDays === 0 && <Cake className="h-3.5 w-3.5 text-amber-500" />}
                        </div>
                        {c.position && <div className="text-xs text-muted-foreground">{c.position}</div>}
                        {/* date info row */}
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {c.birth_date && (
                            <span className="flex items-center gap-1">
                              <Cake className="h-3 w-3" />
                              {formatDateTH(c.birth_date)}
                              {c.birth_year && <span>({c.birth_year})</span>}
                            </span>
                          )}
                          {!c.birth_date && c.birth_year && (
                            <span className="flex items-center gap-1">
                              <Cake className="h-3 w-3" /> ปีเกิด พ.ศ. {c.birth_year + 543}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {c.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {c.phone}
                            </span>
                          )}
                          {c.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" /> {c.email}
                            </span>
                          )}
                          {c.line_id && (
                            <span className="flex items-center gap-1">
                              <MessageCircle className="h-3 w-3" /> {c.line_id}
                            </span>
                          )}
                        </div>
                        {c.personal_notes && (
                          <div className="mt-1 text-xs text-muted-foreground italic border-l-2 border-muted pl-2">
                            {c.personal_notes}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => { setEditContact(c); setContactOpen(true); }}>
                          แก้ไข
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600" onClick={() => deleteContact(c.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Leads */}
          <section className="rounded-xl border bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold">ดีล</h2>
              {leads.length > 0 && (
                <Badge variant="secondary" className="h-5 text-[10px]">{leads.length}</Badge>
              )}
            </div>

            {leads.length === 0 ? (
              <div className="rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
                ยังไม่มีดีล
              </div>
            ) : (
              <ul className="divide-y rounded-lg border overflow-hidden">
                {leads.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="min-w-0 flex-1">
                      <Link to="/leads/$leadId" params={{ leadId: l.id }} className="block truncate text-sm font-medium text-primary hover:underline">
                        {l.title}
                      </Link>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {l.expected_close_date ? `ปิดคาดหวัง ${formatThaiDate(l.expected_close_date)}` : "ไม่ระบุวันปิด"}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-medium">{l.expected_value != null ? formatBaht(l.expected_value) : "—"}</div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STAGE_COLOR[l.stage as LeadStage]}`}>
                      {STAGE_LABEL_TH[l.stage as LeadStage]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <ContactFormDialog
        open={contactOpen}
        onOpenChange={setContactOpen}
        accountId={accountId}
        initial={editContact}
        onSaved={() => { setContactOpen(false); load(); }}
      />
    </div>
  );
}

// ── Contact Form Dialog ────────────────────────────────────────────────────────

function ContactFormDialog({
  open, onOpenChange, accountId, initial, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accountId: string;
  initial: Contact | null;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const isEdit = !!initial;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", nickname: "", position: "", email: "", phone: "", line_id: "",
    birth_date: "", birth_year: "", gender: "", personal_notes: "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        name:          initial?.name          ?? "",
        nickname:      initial?.nickname       ?? "",
        position:      initial?.position       ?? "",
        email:         initial?.email          ?? "",
        phone:         initial?.phone          ?? "",
        line_id:       initial?.line_id        ?? "",
        birth_date:    initial?.birth_date     ?? "",
        birth_year:    initial?.birth_year != null ? String(initial.birth_year) : "",
        gender:        initial?.gender         ?? "",
        personal_notes: initial?.personal_notes ?? "",
      });
    }
  }, [open, initial]);

  const submit = async () => {
    if (!form.name.trim()) return toast.error("กรุณาระบุชื่อผู้ติดต่อ");
    setSaving(true);
    const payload = {
      account_id:    accountId,
      name:          form.name.trim(),
      nickname:      form.nickname.trim() || null,
      position:      form.position.trim() || null,
      email:         form.email.trim() || null,
      phone:         form.phone.trim() || null,
      line_id:       form.line_id.trim() || null,
      birth_date:    form.birth_date || null,
      birth_year:    form.birth_year ? Number(form.birth_year) : null,
      gender:        form.gender || null,
      personal_notes: form.personal_notes.trim() || null,
    };
    let error;
    if (isEdit && initial) {
      ({ error } = await crmDb().from("contacts").update(payload).eq("id", initial.id));
    } else {
      ({ error } = await crmDb().from("contacts").insert({ ...payload, created_by: user?.id }));
    }
    setSaving(false);
    if (error) return toast.error("บันทึกไม่สำเร็จ", { description: error.message });
    toast.success(isEdit ? "แก้ไขผู้ติดต่อแล้ว" : "เพิ่มผู้ติดต่อแล้ว");
    onSaved();
  };

  const currentYear = new Date().getFullYear();
  const buddhistYear = currentYear + 543;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "แก้ไขผู้ติดต่อ" : "เพิ่มผู้ติดต่อ"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1 max-h-[70vh] overflow-y-auto pr-1">

          {/* ── ข้อมูลพื้นฐาน ── */}
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">ข้อมูลพื้นฐาน</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">ชื่อ-นามสกุล <span className="text-red-500">*</span></Label>
                <Input placeholder="ชื่อเต็ม" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">ชื่อเล่น / Nickname</Label>
                <Input placeholder="เช่น ต้น, แนน, Bob" value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">ตำแหน่ง</Label>
                <Input placeholder="เช่น CEO, ผจก.จัดซื้อ" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">เพศ</Label>
                <Select value={form.gender || "none"} onValueChange={(v) => setForm({ ...form, gender: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="เลือก" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                    <SelectItem value="male">ชาย</SelectItem>
                    <SelectItem value="female">หญิง</SelectItem>
                    <SelectItem value="other">อื่นๆ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ── ช่องทางติดต่อ ── */}
          <div className="space-y-3 border-t pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">ช่องทางติดต่อ</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">โทรศัพท์</Label>
                <Input placeholder="08x-xxx-xxxx" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Line ID</Label>
                <Input placeholder="@line_id" value={form.line_id} onChange={(e) => setForm({ ...form, line_id: e.target.value })} />
              </div>
            </div>
            <div>
              <Label className="text-xs">อีเมล</Label>
              <Input type="email" placeholder="email@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>

          {/* ── วันเกิด ── */}
          <div className="space-y-3 border-t pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Cake className="h-3.5 w-3.5" /> วันเกิด
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">วันเกิด (ถ้าทราบ)</Label>
                <Input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
                {form.birth_date && (
                  <p className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1">
                    <Cake className="h-3 w-3" />
                    <DaysUntilBadge days={daysUntilNextOccurrence(form.birth_date)} />
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs">ปีเกิด ค.ศ. (ถ้าไม่รู้วัน)</Label>
                <Input
                  type="number"
                  placeholder={String(currentYear - 40)}
                  min={1920}
                  max={currentYear}
                  value={form.birth_year}
                  onChange={(e) => setForm({ ...form, birth_year: e.target.value })}
                />
                {form.birth_year && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    พ.ศ. {Number(form.birth_year) + 543} · อายุประมาณ {currentYear - Number(form.birth_year)} ปี
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── บันทึกส่วนตัว ── */}
          <div className="space-y-3 border-t pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> บันทึกส่วนตัว / ความสนใจ
            </p>
            <div>
              <Label className="text-xs">
                บันทึก (ครอบครัว, งานอดิเรก, ความสนใจ, สิ่งที่ไม่ชอบ)
              </Label>
              <Textarea
                rows={3}
                placeholder="เช่น ชอบกอล์ฟ, มีลูก 2 คน, ไม่ชอบถูกโทรในช่วงบ่าย, ดื่มกาแฟ Americano"
                value={form.personal_notes}
                onChange={(e) => setForm({ ...form, personal_notes: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {isEdit ? "บันทึก" : "เพิ่ม"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
