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
  registered_capital: number | null;
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
  const [expandedContactId, setExpandedContactId] = useState<string | "new" | null>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [quotations, setQuotations] = useState<any[]>([]);

  const [form, setForm] = useState({
    name: "", industry: "", website: "", phone: "", address: "",
    is_key_account: false, key_account_note: "",
    founded_date: "",
    fiscal_year_end_month: "",
    customer_since: "",
    employee_count: "",
    annual_revenue_range: "",
    registered_capital: "",
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
        registered_capital: acc.registered_capital != null ? String(acc.registered_capital) : "",
      });
      // Load activity history + quotations for timeline
      const [actsRes, qtsRes] = await Promise.all([
        crmDb().from("activities").select("id,type,subject,done_at,created_at,lead_id").in("lead_id", (leadsRes.data ?? []).map((l: any) => l.id)).order("created_at", { ascending: false }).limit(20),
        crmDb().from("quotations").select("id,quotation_no,title,grand_total,status,issued_date,lead_id").in("lead_id", (leadsRes.data ?? []).map((l: any) => l.id)).order("issued_date", { ascending: false }).limit(10),
      ]);
      setActivities((actsRes.data ?? []) as any[]);
      setQuotations((qtsRes.data ?? []) as any[]);
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
      registered_capital: form.registered_capital ? Number(form.registered_capital.replace(/,/g, "")) : null,
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
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-base font-semibold truncate">{account.name}</h1>
            {form.is_key_account && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                <Crown className="h-3 w-3" /> Key Account
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
            <span><span className="font-semibold text-foreground">{activeLeads.length}</span> ดีล Active</span>
            <span className="text-primary font-semibold">{formatBaht(pipeline)}</span>
            <span><span className="font-semibold text-foreground">{contacts.length}</span> ผู้ติดต่อ</span>
          </div>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            บันทึก
          </Button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="border-b bg-background px-6">
        <div className="flex">
          {([
            { key: "info",     label: "ข้อมูลบริษัท", icon: Building2 },
            { key: "contacts", label: `ผู้ติดต่อ${contacts.length > 0 ? ` (${contacts.length})` : ""}`, icon: Users },
            { key: "deals",    label: `ดีล${leads.length > 0 ? ` (${leads.length})` : ""}`, icon: Star },
          ] as { key: "info"|"contacts"|"deals"; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm transition-colors ${
                tab === key ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-auto">

        {/* ════ TAB: ข้อมูลบริษัท ════ */}
        {tab === "info" && (
          <div className="p-6">

            {/* upcoming events banner */}
            {(upcomingContacts.length > 0 || (companyAnnivDays !== null && companyAnnivDays <= 30) || (customerAnnivDays !== null && customerAnnivDays <= 30)) && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  <span className="flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
                    <Star className="h-3.5 w-3.5" /> เหตุการณ์ใน 30 วัน
                  </span>
                  {companyAnnivDays !== null && companyAnnivDays <= 30 && (
                    <span className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                      <CalendarDays className="h-3 w-3" /> ครบรอบก่อตั้ง <DaysUntilBadge days={companyAnnivDays} />
                    </span>
                  )}
                  {customerAnnivDays !== null && customerAnnivDays <= 30 && (
                    <span className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                      <Star className="h-3 w-3" /> ครบรอบลูกค้า <DaysUntilBadge days={customerAnnivDays} />
                    </span>
                  )}
                  {upcomingContacts.map((c) => (
                    <span key={c.id} className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                      <Cake className="h-3 w-3" /> วันเกิด {c.nickname ?? c.name} <DaysUntilBadge days={c.days} />
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 2-column grid — ทุกอย่างอยู่หน้าเดียวไม่ต้องเลื่อน */}
            <div className="grid gap-4 lg:grid-cols-2">

              {/* ─── คอลัมน์ซ้าย: ข้อมูลหลัก ─── */}
              <div className="space-y-3 rounded-xl border bg-card p-5">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">ข้อมูลบริษัท</h2>

                <div>
                  <Label className="text-xs">ชื่อบริษัท <span className="text-red-500">*</span></Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">อุตสาหกรรม</Label>
                    <Input placeholder="เช่น IT, โลจิสติกส์" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">โทรศัพท์</Label>
                    <Input placeholder="02-xxx-xxxx" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">เว็บไซต์</Label>
                  <div className="flex gap-1.5">
                    <Input placeholder="example.com" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
                    {form.website && (
                      <a href={form.website.startsWith("http") ? form.website : `https://${form.website}`}
                        target="_blank" rel="noreferrer"
                        className="flex shrink-0 items-center rounded-md border px-2 text-muted-foreground hover:text-foreground">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
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
                    <Label className="text-xs">รายได้ต่อปี</Label>
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

                <div>
                  <Label className="text-xs">ทุนจดทะเบียน (บาท)</Label>
                  <Input
                    type="number"
                    placeholder="เช่น 1000000"
                    value={form.registered_capital}
                    onChange={(e) => setForm({ ...form, registered_capital: e.target.value })}
                  />
                  {form.registered_capital && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {Number(form.registered_capital).toLocaleString("th-TH")} บาท
                      {Number(form.registered_capital) >= 5000000 ? " · ขนาดกลาง-ใหญ่" :
                       Number(form.registered_capital) >= 1000000 ? " · ขนาดกลาง" :
                       " · ขนาดเล็ก (SME)"}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
                  <span className="flex items-center gap-1.5 text-xs font-medium">
                    <Crown className="h-3.5 w-3.5 text-amber-500" /> Key Account (VIP)
                  </span>
                  <Switch checked={form.is_key_account} onCheckedChange={(v) => setForm({ ...form, is_key_account: v })} />
                </div>
                {form.is_key_account && (
                  <Input placeholder="หมายเหตุ Key Account เช่น ดูแลพิเศษ" value={form.key_account_note} onChange={(e) => setForm({ ...form, key_account_note: e.target.value })} />
                )}

                <p className="text-[11px] text-muted-foreground">สร้างเมื่อ {formatThaiDate(account.created_at)}</p>
              </div>

              {/* ─── คอลัมน์ขวา: วันสำคัญ + ผู้ติดต่อ (preview) ─── */}
              <div className="space-y-4">

                {/* วันสำคัญ */}
                <div className="rounded-xl border bg-card p-5 space-y-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" /> วันสำคัญ
                  </h2>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs flex items-center justify-between">
                        <span>ก่อตั้งบริษัท</span>
                        {form.founded_date && <DaysUntilBadge days={daysUntilNextOccurrence(form.founded_date)} />}
                      </Label>
                      <Input type="date" value={form.founded_date} onChange={(e) => setForm({ ...form, founded_date: e.target.value })} />
                      {form.founded_date && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          ก่อตั้งมา {new Date().getFullYear() - new Date(form.founded_date).getFullYear()} ปี
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs flex items-center justify-between">
                        <span>เป็นลูกค้าตั้งแต่</span>
                        {form.customer_since && <DaysUntilBadge days={daysUntilNextOccurrence(form.customer_since)} />}
                      </Label>
                      <Input type="date" value={form.customer_since} onChange={(e) => setForm({ ...form, customer_since: e.target.value })} />
                      {form.customer_since && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          เป็นลูกค้ามา {new Date().getFullYear() - new Date(form.customer_since).getFullYear()} ปี
                        </p>
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
                    {form.fiscal_year_end_month && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">ติดตามก่อนปิดงบ — มักมีงบซื้อก่อนสิ้นปี</p>
                    )}
                  </div>
                </div>

                {/* ผู้ติดต่อ preview */}
                <div className="rounded-xl border bg-card p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" /> ผู้ติดต่อ {contacts.length > 0 && `(${contacts.length})`}
                    </h2>
                    <button onClick={() => setTab("contacts")} className="text-xs text-primary hover:underline">
                      {contacts.length > 0 ? "ดูทั้งหมด →" : "+ เพิ่ม"}
                    </button>
                  </div>
                  {contacts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">ยังไม่มีผู้ติดต่อ</p>
                  ) : (
                    <ul className="space-y-2">
                      {contacts.slice(0, 3).map((c) => (
                        <li key={c.id} className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            {c.name.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-xs font-medium">{c.name}</div>
                            {c.position && <div className="text-[11px] text-muted-foreground">{c.position}</div>}
                          </div>
                          {c.phone && <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{c.phone}</span>}
                        </li>
                      ))}
                      {contacts.length > 3 && (
                        <p className="text-[11px] text-muted-foreground">และอีก {contacts.length - 3} คน</p>
                      )}
                    </ul>
                  )}
                </div>

                {/* ดีล preview */}
                {leads.length > 0 && (
                  <div className="rounded-xl border bg-card p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        <Star className="h-3.5 w-3.5" /> ดีล ({leads.length})
                      </h2>
                      <button onClick={() => setTab("deals")} className="text-xs text-primary hover:underline">ดูทั้งหมด →</button>
                    </div>
                    <ul className="space-y-1.5">
                      {leads.slice(0, 3).map((l) => (
                        <li key={l.id} className="flex items-center gap-2">
                          <Link to="/leads/$leadId" params={{ leadId: l.id }} className="min-w-0 flex-1 truncate text-xs font-medium text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                            {l.title}
                          </Link>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STAGE_COLOR[l.stage as LeadStage]}`}>
                            {STAGE_LABEL_TH[l.stage as LeadStage]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button onClick={save} disabled={saving}>
                    {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                    บันทึก
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════ TAB: ผู้ติดต่อ ════ */}
        {tab === "contacts" && (
          <div className="mx-auto max-w-3xl p-6 space-y-4">

            {/* ── Contact list with inline expand ── */}
            <div className="rounded-xl border bg-card overflow-hidden">
              {contacts.length === 0 && expandedContactId !== "new" ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  <Users className="mx-auto mb-2 h-7 w-7 opacity-30" />
                  ยังไม่มีผู้ติดต่อ
                </div>
              ) : (
                <ul className="divide-y">
                  {contacts.map((c) => {
                    const bDays = daysUntilNextOccurrence(c.birth_date);
                    const isExpanded = expandedContactId === c.id;
                    return (
                      <li key={c.id}>
                        {/* ── Summary row (always visible) ── */}
                        <div
                          className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${isExpanded ? "bg-primary/5 border-l-2 border-primary" : "hover:bg-muted/30"}`}
                          onClick={() => setExpandedContactId(isExpanded ? null : c.id)}
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            {c.name.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-medium text-sm">{c.name}</span>
                              {c.nickname && <span className="text-xs text-muted-foreground">({c.nickname})</span>}
                              {c.position && <span className="text-xs text-muted-foreground">· {c.position}</span>}
                              {bDays !== null && bDays <= 30 && <DaysUntilBadge days={bDays} />}
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
                              {c.phone && <span>{c.phone}</span>}
                              {c.email && <span>{c.email}</span>}
                              {c.line_id && <span>LINE: {c.line_id}</span>}
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground">{isExpanded ? "▲" : "▼"}</span>
                        </div>

                        {/* ── Inline expand: full edit form ── */}
                        {isExpanded && (
                          <div className="border-t bg-muted/20 px-4 py-4">
                            <InlineContactForm
                              initial={c}
                              accountId={accountId}
                              onSaved={() => { setExpandedContactId(null); load(); }}
                              onDelete={() => { deleteContact(c.id); setExpandedContactId(null); }}
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* ── Add new inline ── */}
              {expandedContactId === "new" ? (
                <div className="border-t bg-muted/20 px-4 py-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-3">เพิ่มผู้ติดต่อใหม่</p>
                  <InlineContactForm
                    initial={null}
                    accountId={accountId}
                    onSaved={() => { setExpandedContactId(null); load(); }}
                    onDelete={() => setExpandedContactId(null)}
                  />
                </div>
              ) : (
                <div className="border-t p-3">
                  <button
                    onClick={() => setExpandedContactId("new")}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-primary hover:bg-primary/5 transition-colors"
                  >
                    <Plus className="h-4 w-4" /> เพิ่มผู้ติดต่อ
                  </button>
                </div>
              )}
            </div>

            {/* ── ประวัติการติดต่อ ── */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" /> ประวัติการติดต่อ
                </h2>
                <span className="text-xs text-muted-foreground">{activities.length + quotations.length} รายการ</span>
              </div>

              {activities.length === 0 && quotations.length === 0 ? (
                <div className="py-10 text-center text-xs text-muted-foreground">ยังไม่มีประวัติ</div>
              ) : (
                <ul className="divide-y">
                  {/* merge and sort by date */}
                  {[
                    ...activities.map((a) => ({ ...a, _type: "activity", _date: a.done_at ?? a.created_at })),
                    ...quotations.map((q) => ({ ...q, _type: "quotation", _date: q.issued_date ?? q.created_at })),
                    ...leads.map((l) => ({ ...l, _type: "deal", _date: l.created_at })),
                  ]
                    .sort((a, b) => new Date(b._date).getTime() - new Date(a._date).getTime())
                    .slice(0, 20)
                    .map((item, i) => {
                      if (item._type === "activity") {
                        const iconMap: Record<string, string> = { call: "📞", email: "✉️", meeting: "👥", line: "💬", note: "📝" };
                        return (
                          <li key={`a-${item.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30">
                            <span className="mt-0.5 text-base">{iconMap[item.type] ?? "📝"}</span>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium text-foreground">{item.subject ?? item.type}</div>
                              <div className="text-[11px] text-muted-foreground">{formatThaiDate(item._date)}</div>
                            </div>
                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">กิจกรรม</span>
                          </li>
                        );
                      }
                      if (item._type === "quotation") {
                        return (
                          <li key={`q-${item.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30">
                            <span className="mt-0.5 text-base">📄</span>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium text-foreground">{item.quotation_no} — {item.title}</div>
                              <div className="text-[11px] text-muted-foreground">{formatBaht(item.grand_total)} · {formatThaiDate(item._date)}</div>
                            </div>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              item.status === "accepted" ? "bg-emerald-100 text-emerald-700" :
                              item.status === "rejected" ? "bg-red-100 text-red-700" :
                              "bg-muted text-muted-foreground"
                            }`}>{item.status === "accepted" ? "อนุมัติ" : item.status === "rejected" ? "ปฏิเสธ" : item.status ?? "ใบเสนอราคา"}</span>
                          </li>
                        );
                      }
                      // deal
                      return (
                        <li key={`d-${item.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30">
                          <span className="mt-0.5 text-base">💼</span>
                          <div className="min-w-0 flex-1">
                            <Link to="/leads/$leadId" params={{ leadId: item.id }} className="text-xs font-medium text-primary hover:underline">{item.title}</Link>
                            <div className="text-[11px] text-muted-foreground">{item.expected_value != null ? formatBaht(item.expected_value) : ""} · {formatThaiDate(item._date)}</div>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STAGE_COLOR[item.stage as LeadStage]}`}>
                            {STAGE_LABEL_TH[item.stage as LeadStage]}
                          </span>
                        </li>
                      );
                    })}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* ════ TAB: ดีล ════ */}
        {tab === "deals" && (
          <div className="mx-auto max-w-2xl p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">ดีล ({leads.length})</h2>
              <span className="text-xs text-muted-foreground">{activeLeads.length} Active · {formatBaht(pipeline)}</span>
            </div>
            {leads.length === 0 ? (
              <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
                <Star className="mx-auto mb-2 h-8 w-8 opacity-30" />
                ยังไม่มีดีล
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
                    <div className="shrink-0 text-sm font-medium">{l.expected_value != null ? formatBaht(l.expected_value) : "—"}</div>
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

    </div>
  );
}

// ── Contact Form Dialog ────────────────────────────────────────────────────────

function InlineContactForm({
  initial, accountId, onSaved, onDelete,
}: {
  initial: Contact | null;
  accountId: string;
  onSaved: () => void;
  onDelete: () => void;
}) {
  const { user } = useAuth();
  const isEdit = !!initial;
  const [saving, setSaving] = useState(false);
  const currentYear = new Date().getFullYear();

  const [form, setForm] = useState({
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

  const submit = async () => {
    if (!form.name.trim()) return toast.error("กรุณาระบุชื่อผู้ติดต่อ");
    setSaving(true);
    const payload = {
      account_id:     accountId,
      name:           form.name.trim(),
      nickname:       form.nickname.trim() || null,
      position:       form.position.trim() || null,
      email:          form.email.trim() || null,
      phone:          form.phone.trim() || null,
      line_id:        form.line_id.trim() || null,
      birth_date:     form.birth_date || null,
      birth_year:     form.birth_year ? Number(form.birth_year) : null,
      gender:         form.gender || null,
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
    toast.success(isEdit ? "แก้ไขแล้ว" : "เพิ่มผู้ติดต่อแล้ว");
    onSaved();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <Label className="text-xs">ชื่อ-นามสกุล <span className="text-red-500">*</span></Label>
          <Input autoFocus placeholder="ชื่อเต็ม" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">ชื่อเล่น</Label>
          <Input placeholder="ต้น, JOY" value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">ตำแหน่ง</Label>
          <Input placeholder="CEO, ผจก." value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <Label className="text-xs">โทรศัพท์</Label>
          <Input placeholder="08x-xxx-xxxx" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Line ID</Label>
          <Input placeholder="@line_id" value={form.line_id} onChange={(e) => setForm({ ...form, line_id: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">อีเมล</Label>
          <Input type="email" placeholder="email@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <Label className="text-xs flex items-center gap-1"><Cake className="h-3 w-3" /> วันเกิด</Label>
          <Input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
          {form.birth_date && <p className="mt-0.5 text-[11px] text-muted-foreground"><DaysUntilBadge days={daysUntilNextOccurrence(form.birth_date)} /></p>}
        </div>
        <div>
          <Label className="text-xs">ปีเกิด ค.ศ.</Label>
          <Input type="number" placeholder={String(currentYear - 40)} min={1920} max={currentYear}
            value={form.birth_year} onChange={(e) => setForm({ ...form, birth_year: e.target.value })} />
          {form.birth_year && <p className="mt-0.5 text-[11px] text-muted-foreground">อายุ ~{currentYear - Number(form.birth_year)} ปี</p>}
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

      <div>
        <Label className="text-xs">บันทึกส่วนตัว (ครอบครัว, งานอดิเรก, ความสนใจ)</Label>
        <Textarea rows={2} placeholder="เช่น ชอบกอล์ฟ, ดื่มกาแฟ Americano, ไม่รับสายช่วงบ่าย"
          value={form.personal_notes} onChange={(e) => setForm({ ...form, personal_notes: e.target.value })} />
      </div>

      <div className="flex items-center justify-between pt-1">
        {isEdit ? (
          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={onDelete}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> ลบผู้ติดต่อ
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={onDelete}>ยกเลิก</Button>
        )}
        <Button size="sm" onClick={submit} disabled={saving}>
          {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          {isEdit ? "บันทึก" : "เพิ่มผู้ติดต่อ"}
        </Button>
      </div>
    </div>
  );
}
