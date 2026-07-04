import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft, Building2, Loader2, Plus, Save, ExternalLink, Phone, Mail, MessageCircle, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { crmDb, STAGE_LABEL_TH, ACTIVE_STAGES, type LeadStage } from "@/lib/crm";
import { formatBaht, formatThaiDate } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/accounts/$accountId")({
  component: AccountDetailPage,
});

interface Account {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  owner_id: string | null;
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
  created_at: string;
}

const STAGE_COLOR: Record<LeadStage, string> = {
  new:          "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  qualified:    "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  proposal:     "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  negotiation:  "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  closing:      "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  won:          "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  lost:         "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

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
        <div className="space-y-6 lg:w-[340px] lg:shrink-0">
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
            <div>
              <Label className="text-xs">เว็บไซต์</Label>
              <div className="flex items-center gap-2">
                <Input placeholder="example.com" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} onBlur={save} />
                {form.website && (
                  <a
                    href={form.website.startsWith("http") ? form.website : `https://${form.website}`}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
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
            <div className="pt-1 text-[11px] text-muted-foreground">
              สร้างเมื่อ {formatThaiDate(account.created_at)}
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
                {contacts.map((c) => (
                  <li key={c.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {c.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm">{c.name}</div>
                      {c.position && <div className="text-xs text-muted-foreground">{c.position}</div>}
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
                ))}
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
                      <Link
                        to="/leads/$leadId"
                        params={{ leadId: l.id }}
                        className="block truncate text-sm font-medium text-primary hover:underline"
                      >
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

// ─── Contact Form Dialog ──────────────────────────────────────────────────────

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
  const [form, setForm] = useState({ name: "", position: "", email: "", phone: "", line_id: "" });

  useEffect(() => {
    if (open) {
      setForm({
        name: initial?.name ?? "",
        position: initial?.position ?? "",
        email: initial?.email ?? "",
        phone: initial?.phone ?? "",
        line_id: initial?.line_id ?? "",
      });
    }
  }, [open, initial]);

  const submit = async () => {
    if (!form.name.trim()) return toast.error("กรุณาระบุชื่อผู้ติดต่อ");
    setSaving(true);
    const payload = {
      account_id: accountId,
      name: form.name.trim(),
      position: form.position.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      line_id: form.line_id.trim() || null,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "แก้ไขผู้ติดต่อ" : "เพิ่มผู้ติดต่อ"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <Label className="text-xs">ชื่อ <span className="text-red-500">*</span></Label>
            <Input placeholder="ชื่อ-นามสกุล" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">ตำแหน่ง</Label>
            <Input placeholder="เช่น CEO, ผู้จัดการฝ่ายจัดซื้อ" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
          </div>
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
          <div className="flex justify-end gap-2 pt-2">
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
