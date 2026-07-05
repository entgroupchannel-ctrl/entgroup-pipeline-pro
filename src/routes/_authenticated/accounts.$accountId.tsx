import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
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
    try {
      const [accRes, contactsRes, leadsRes] = await Promise.all([
        crmDb().from("accounts").select("*").eq("id", accountId).maybeSingle(),
        crmDb().from("contacts").select("*").eq("account_id", accountId).order("name"),
        crmDb().from("leads").select("*").eq("account_id", accountId).order("updated_at", { ascending: false }),
      ]);
      if (accRes.error || !accRes.data) {
        toast.error("โหลดข้อมูลบริษัทไม่สำเร็จ");
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
    } catch (err) {
      console.error("[account-detail] load crashed:", err);
      toast.error("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
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

  const [tab, setTab] = useState<"info" | "contacts" | "deals">("info");

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

      {/* ── Top bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-6 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/accounts" })}>
            <ArrowLeft className="mr-1 h-4 w-4" /> รายชื่อลูกค้า
          </Button>
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <h1 className="text-base font-semibold truncate">{account.name}</h1>
            {form.is_key_account && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                <Crown className="h-3 w-3" /> Key Account
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* KPI inline */}
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {activeLeads.length} ดีล Active · {formatBaht(pipeline)}
          </span>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            บันทึก
          </Button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="border-b bg-background px-6">
        <div className="flex gap-0">
          {([
            { key: "info",     label: "ข้อมูลบริษัท",     icon: Building2 },
            { key: "contacts", label: `ผู้ติดต่อ${contacts.length > 0 ? ` (${contacts.length})` : ""}`, icon: Users },
            { key: "deals",    label: `ดีล${leads.length > 0 ? ` (${leads.length})` : ""}`, icon: Star },
          ] as { key: "info" | "contacts" | "deals"; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm transition-colors ${
                tab === key
                  ? "border-primary text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto">

        {/* ── TAB: ข้อมูลบริษัท ── */}
        {tab === "info" && (
          <div className="mx-auto max-w-2xl space-y-5 p-6">

            {/* Upcoming events banner */}
            {(upcomingContacts.length > 0 || (companyAnnivDays !== null && companyAnnivDays <= 30) || (customerAnnivDays !== null && customerAnnivDays <= 30)) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1.5 dark:border-amber-900/40 dark:bg-amber-950/20">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                  <Star className="h-3.5 w-3.5" /> เหตุการณ์สำคัญใน 30 วัน
                </div>
                {companyAnnivDays !== null && companyAnnivDays <= 30 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1"><CalendarDays className="h-3 w-3" /> ครบรอบก่อตั้ง</span>
                    <DaysUntilBadge days={companyAnnivDays} />
                  </div>
                )}
                {customerAnnivDays !== null && customerAnnivDays <= 30 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1"><Star className="h-3 w-3" /> ครบรอบลูกค้า</span>
                    <DaysUntilBadge days={customerAnnivDays} />
                  </div>
                )}
                {upcomingContacts.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-xs">
                    <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1"><Cake className="h-3 w-3" /> วันเกิด {c.nickname ?? c.name}</span>
                    <DaysUntilBadge days={c.days} />
                  </div>
                ))}
              </div>
            )}

            {/* ── ข้อมูลหลัก ── */}
            <section className="rounded-xl border bg-card p-5 space-y-4">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">ข้อมูลทั่วไป</h2>

              <div>
                <Label className="text-xs">ชื่อบริษัท <span className="text-red-500">*</span></Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">อุตสาหกรรม</Label>
                  <Input placeholder="เช่น อาหาร, IT" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">ประเภทบัญชี</Label>
                  <div className="flex items-center gap-1.5 pt-1">
                    <Switch checked={form.is_key_account} onCheckedChange={(v) => setForm({ ...form, is_key_account: v })} />
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Crown className="h-3 w-3 text-amber-500" /> Key Account
                    </span>
                  </div>
                </div>
              </div>

              {form.is_key_account && (
                <div>
                  <Label className="text-xs">หมายเหตุ Key Account</Label>
                  <Input placeholder="เช่น ลูกค้า VIP ดูแลพิเศษ" value={form.key_account_note} onChange={(e) => setForm({ ...form, key_account_note: e.target.value })} />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">โทรศัพท์</Label>
                  <Input placeholder="02-xxx-xxxx" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">เว็บไซต์</Label>
                  <div className="flex gap-1.5">
                    <Input placeholder="example.com" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
                    {form.website && (
                      <a href={form.website.startsWith("http") ? form.website : `https://${form.website}`} target="_blank" rel="noreferrer" className="flex items-center px-2 border rounded-md text-muted-foreground hover:text-foreground">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-xs">ที่อยู่</Label>
                <Input placeholder="ที่อยู่บริษัท" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">จำนวนพนักงาน</Label>
                  <Select value={form.employee_count || "none"} onValueChange={(v) => setForm({ ...form, employee_count: v === "none" ? "" : v })}>
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
                  <Select value={form.annual_revenue_range || "none"} onValueChange={(v) => setForm({ ...form, annual_revenue_range: v === "none" ? "" : v })}>
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

              <p className="text-[11px] text-muted-foreground">สร้างเมื่อ {formatThaiDate(account.created_at)}</p>
            </section>

            {/* ── วันสำคัญ ── */}
            <section className="rounded-xl border bg-card p-5 space-y-4">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <CalendarDays className="h-4 w-4" /> วันสำคัญ
              </h2>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs flex items-center justify-between">
                    <span>วันก่อตั้งบริษัท</span>
                    {form.founded_date && <DaysUntilBadge days={daysUntilNextOccurrence(form.founded_date)} />}
                  </Label>
                  <Input type="date" value={form.founded_date} onChange={(e) => setForm({ ...form, founded_date: e.target.value })} />
                  {form.founded_date && (
                    <p className="mt-1 text-[11px] text-muted-foreground">ก่อตั้งมา {new Date().getFullYear() - new Date(form.founded_date).getFullYear()} ปี</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs flex items-center justify-between">
                    <span>เป็นลูกค้าตั้งแต่</span>
                    {form.customer_since && <DaysUntilBadge days={daysUntilNextOccurrence(form.customer_since)} />}
                  </Label>
                  <Input type="date" value={form.customer_since} onChange={(e) => setForm({ ...form, customer_since: e.target.value })} />
                  {form.customer_since && (
                    <p className="mt-1 text-[11px] text-muted-foreground">เป็นลูกค้ามา {new Date().getFullYear() - new Date(form.customer_since).getFullYear()} ปี</p>
                  )}
                </div>
              </div>

              <div>
                <Label className="text-xs">เดือนปิดงบการเงิน</Label>
                <Select value={form.fiscal_year_end_month || "none"} onValueChange={(v) => setForm({ ...form, fiscal_year_end_month: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="เลือกเดือน" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                    {MONTHS_TH.map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </section>

            {/* Save button bottom */}
            <div className="flex justify-end pb-4">
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                บันทึกข้อมูล
              </Button>
            </div>
          </div>
        )}

        {/* ── TAB: ผู้ติดต่อ ── */}
        {tab === "contacts" && (
          <div className="mx-auto max-w-2xl p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">ผู้ติดต่อ ({contacts.length})</h2>
              <Button size="sm" onClick={() => { setEditContact(null); setContactOpen(true); }}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> เพิ่มผู้ติดต่อ
              </Button>
            </div>

            {contacts.length === 0 ? (
              <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
                <Users className="mx-auto mb-2 h-8 w-8 opacity-30" />
                ยังไม่มีผู้ติดต่อ — กด "เพิ่มผู้ติดต่อ" เพื่อเริ่มต้น
              </div>
            ) : (
              <ul className="divide-y rounded-xl border bg-card overflow-hidden">
                {contacts.map((c) => {
                  const bDays = daysUntilNextOccurrence(c.birth_date);
                  return (
                    <li key={c.id} className="flex items-start gap-3 px-4 py-4 hover:bg-muted/30 transition-colors">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {c.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-sm">{c.name}</span>
                          {c.nickname && <span className="text-xs text-muted-foreground">({c.nickname})</span>}
                          {bDays !== null && bDays <= 30 && <DaysUntilBadge days={bDays} />}
                        </div>
                        {c.position && <div className="text-xs text-muted-foreground mt-0.5">{c.position}</div>}
                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                          {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                          {c.line_id && <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{c.line_id}</span>}
                          {c.birth_date && <span className="flex items-center gap-1"><Cake className="h-3 w-3" />{formatDateTH(c.birth_date)}</span>}
                        </div>
                        {c.personal_notes && (
                          <div className="mt-1.5 text-xs text-muted-foreground italic border-l-2 border-muted pl-2">{c.personal_notes}</div>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => { setEditContact(c); setContactOpen(true); }}>แก้ไข</Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600" onClick={() => deleteContact(c.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* ── TAB: ดีล ── */}
        {tab === "deals" && (
          <div className="mx-auto max-w-2xl p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">ดีลทั้งหมด ({leads.length})</h2>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{activeLeads.length} Active</span>
                <span>·</span>
                <span className="font-medium text-primary">{formatBaht(pipeline)}</span>
              </div>
            </div>

            {leads.length === 0 ? (
              <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
                <Star className="mx-auto mb-2 h-8 w-8 opacity-30" />
                ยังไม่มีดีลที่เชื่อมกับบริษัทนี้
              </div>
            ) : (
              <ul className="divide-y rounded-xl border bg-card overflow-hidden">
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
          </div>
        )}
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
