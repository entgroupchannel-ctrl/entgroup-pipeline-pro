import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Plus, Building2, Star, Crown, Trash2, Download, ExternalLink, User } from "lucide-react";
import { RowActions, BulkActionBar, stdEdit, stdDupe, stdDelete, stdOpen } from "@/components/ui/row-actions";
import { exportToCsv, accountsToRows } from "@/lib/export-csv";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";
import { formatThaiDate } from "@/lib/format";
import { ListPagination, usePagination } from "@/components/list-pagination";

export const Route = createFileRoute("/_authenticated/accounts")({
  component: AccountsPage,
});

interface Account {
  id: string;
  name: string;
  industry: string | null;
  industry_group: string | null;
  full_address: string | null;
  zip_code: string | null;
  credit_days: number | null;
  account_type: string | null;
  tax_id: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  owner_id: string | null;
  created_by: string | null;
  is_key_account: boolean;
  key_account_owner_id: string | null;
  key_account_note: string | null;
  created_at: string;
  updated_at: string;
}

const INDUSTRIES = [
  "ทั้งหมด",
  "เทคโนโลยี/IT",
  "อุตสาหกรรม/โรงงาน",
  "การศึกษา",
  "สุขภาพ/การแพทย์",
  "ภาครัฐ",
  "พลังงาน/สาธารณูปโภค",
  "การค้า/นำเข้า-ส่งออก",
  "ขนส่ง/โลจิสติกส์",
  "ก่อสร้าง/อสังหาริมทรัพย์",
  "อาหาร/เกษตร",
  "โรงแรม/ท่องเที่ยว",
  "ค้าปลีก/ค้าส่ง",
  "สื่อ/โฆษณา",
  "การเงิน/ธนาคาร",
  "อื่นๆ",
] as const;

const INDUSTRY_COLOR: Record<string, string> = {
  "เทคโนโลยี/IT": "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  "อุตสาหกรรม/โรงงาน": "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  "การศึกษา": "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  "สุขภาพ/การแพทย์": "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  "ภาครัฐ": "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  "พลังงาน/สาธารณูปโภค": "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  "การค้า/นำเข้า-ส่งออก": "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300",
  "ขนส่ง/โลจิสติกส์": "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  "ก่อสร้าง/อสังหาริมทรัพย์": "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
  "อาหาร/เกษตร": "bg-lime-100 text-lime-700 dark:bg-lime-950/40 dark:text-lime-300",
  "โรงแรม/ท่องเที่ยว": "bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300",
  "ค้าปลีก/ค้าส่ง": "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  "สื่อ/โฆษณา": "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  "การเงิน/ธนาคาร": "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300",
  "อื่นๆ": "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

function AccountsPage() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const isManager = role === "manager" || role === "admin";
  const isAdmin = role === "admin"; // admin = super admin (highest role)

  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [leadsCount, setLeadsCount] = useState<Map<string, number>>(new Map());
  const [contactsMap, setContactsMap] = useState<Map<string, { name: string; phone: string | null }>>(new Map());
  const [q, setQ] = useState("");
  const [industryFilter, setIndustryFilter] = useState("ทั้งหมด");
  const [newOpen, setNewOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = async () => {
    // Fetch accounts + leads in parallel; contacts fetched separately so an error won't block the main list
    const [accRes, leadsRes] = await Promise.all([
      crmDb().from("accounts").select("*").order("name"),
      crmDb().from("leads").select("id,account_id"),
    ]);
    if (accRes.error) {
      toast.error("โหลดรายชื่อลูกค้าไม่สำเร็จ", { description: accRes.error.message });
      return;
    }
    setAccounts((accRes.data ?? []) as Account[]);

    // count leads per account
    const counts = new Map<string, number>();
    (leadsRes.data ?? []).forEach((l: any) => {
      if (l.account_id) counts.set(l.account_id, (counts.get(l.account_id) ?? 0) + 1);
    });
    setLeadsCount(counts);

    // contacts — fetch separately; ignore error (RLS / missing table won't break the list)
    const contactsRes = await crmDb()
      .from("contacts")
      .select("id,account_id,name,phone")
      .order("name");
    if (!contactsRes.error) {
      const cmap = new Map<string, { name: string; phone: string | null }>();
      (contactsRes.data ?? []).forEach((c: any) => {
        if (c.account_id && !cmap.has(c.account_id)) {
          cmap.set(c.account_id, { name: c.name, phone: c.phone });
        }
      });
      setContactsMap(cmap);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleSelect = (id: string) => setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const selectAll = () => setSelected(new Set((filtered ?? []).map(a => a.id)));
  const clearAll  = () => setSelected(new Set());

  const duplicateAccount = async (a: Account) => {
    const { error } = await crmDb().from("accounts").insert({
      name: `${a.name} (สำเนา)`,
      industry: a.industry,
      tax_id: a.tax_id,
      full_address: a.full_address,
      zip_code: a.zip_code,
      credit_days: a.credit_days,
      account_type: a.account_type,
      website: a.website,
      phone: a.phone,
      address: a.address,
      owner_id: user?.id,
      created_by: user?.id,
    });
    if (error) { toast.error("สร้างซ้ำไม่สำเร็จ"); return; }
    toast.success("สร้างซ้ำแล้ว"); load();
  };

  const deleteAccount = async (id: string) => {
    const _ok = await confirm({ title: "ลบบริษัทนี้? (ดีลที่เชื่อมอยู่จะไม่ถูกลบ)", variant: "danger" });
    if (!_ok) return;
    const { error } = await crmDb().from("accounts").delete().eq("id", id);
    if (error) { toast.error("ลบไม่สำเร็จ"); return; }
    toast.success("ลบแล้ว"); load();
  };

  const bulkDelete = async () => {
    const _ok = await confirm({ title: `ลบ ${selected.size} บริษัท?`, variant: "danger" });
    if (!_ok) return;
    const ids = Array.from(selected);
    const { error } = await crmDb().from("accounts").delete().in("id", ids);
    if (error) { toast.error("ลบไม่สำเร็จ"); return; }
    toast.success(`ลบ ${ids.length} รายการแล้ว`); clearAll(); load();
  };

  const filtered = useMemo(() => {
    if (!accounts) return null;
    const needle = q.trim().toLowerCase();
    return accounts.filter((a) => {
      if (industryFilter !== "ทั้งหมด" && a.industry !== industryFilter) return false;
      if (!needle) return true;
      return (
        a.name.toLowerCase().includes(needle) ||
        (a.industry ?? "").toLowerCase().includes(needle) ||
        (a.tax_id ?? "").toLowerCase().includes(needle)
      );
    });
  }, [accounts, q, industryFilter]);

  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    total: pagedTotal,
    paged: pageItems,
  } = usePagination(filtered ?? [], 25);

  const handleExport = () => {
    if (!isAdmin) { toast.error("ไม่มีสิทธิ์ Export — เฉพาะ Admin เท่านั้น"); return; }
    if (!filtered?.length) { toast.error("ไม่มีข้อมูลที่จะ export"); return; }
    const profMap = new Map<string, { name: string }>(
      Array.from(new Set(filtered.map(a => a.owner_id).filter((id): id is string => id !== null))).map(id => [id, { name: id }])
    );
    const rows = accountsToRows(filtered, leadsCount, profMap);
    exportToCsv(`accounts-${new Date().toISOString().slice(0,10)}.csv`, rows);
    toast.success(`Export ${filtered.length} รายการแล้ว`);
  };

  return (
    <div className="p-6 page-fade-in">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">รายชื่อลูกค้า</h1>
          <p className="text-xs text-muted-foreground">
            {filtered == null ? "กำลังโหลด…" : `${filtered.length} บริษัท`}
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!filtered?.length} title="เฉพาะ Admin เท่านั้น">
              <Download className="mr-1.5 h-4 w-4" /> Export CSV
            </Button>
          )}
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> เพิ่มบริษัท
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8 text-sm"
            placeholder="ค้นหาชื่อบริษัท / อุตสาหกรรม"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {/* Industry filter */}
      <div className="mb-4 -mx-6 px-6">
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
          {INDUSTRIES.map((ind) => (
            <button
              key={ind}
              onClick={() => setIndustryFilter(ind)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs transition-colors ${
                industryFilter === ind
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              }`}
            >
              {ind}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <BulkActionBar
        count={selected.size}
        total={filtered?.length ?? 0}
        onSelectAll={selectAll}
        onClearAll={clearAll}
        actions={[{ label: "ลบที่เลือก", icon: <Trash2 className="h-3.5 w-3.5" />, onClick: bulkDelete, variant: "danger" }]}
      />

      {filtered === null ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          <Building2 className="mx-auto mb-2 h-8 w-8 opacity-30" />
          ไม่พบบริษัท
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-[11px] text-muted-foreground uppercase tracking-wide">
                  <th className="px-3 py-2.5 w-8">
                    <Checkbox checked={!!filtered?.length && selected.size === filtered.length} onCheckedChange={(v) => v ? selectAll() : clearAll()} />
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium">ชื่อบริษัท</th>
                  <th className="px-4 py-2.5 text-left font-medium">อุตสาหกรรม</th>
                  <th className="px-4 py-2.5 text-left font-medium">ดีล</th>
                  <th className="px-4 py-2.5 text-left font-medium">ผู้ติดต่อหลัก</th>
                  <th className="px-4 py-2.5 text-left font-medium">เว็บไซต์</th>
                  <th className="px-4 py-2.5 text-left font-medium">โทรศัพท์</th>
                  <th className="px-4 py-2.5 text-left font-medium">อัปเดต</th>
                  <th className="px-2 py-2.5 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {pageItems.map((a) => {
                  const primaryContact = contactsMap.get(a.id) ?? null;
                  const initials = primaryContact
                    ? primaryContact.name.split(" ").map((s: string) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()
                    : null;
                  const dealCount = leadsCount.get(a.id) ?? 0;

                  return (
                    <tr
                      key={a.id}
                      className={`hover:bg-muted/30 transition-colors cursor-pointer ${selected.has(a.id) ? "bg-primary/5" : ""}`}
                      onClick={() => navigate({ to: "/accounts/$accountId", params: { accountId: a.id } })}
                    >
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selected.has(a.id)} onCheckedChange={() => toggleSelect(a.id)} />
                      </td>

                      {/* ชื่อบริษัท */}
                      <td className="px-4 py-3 max-w-[220px]">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-primary truncate">{a.name}</span>
                          {a.is_key_account && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 shrink-0">
                              <Crown className="h-2.5 w-2.5" /> Key
                            </span>
                          )}
                        </div>
                        {a.account_type && (
                          <div className="text-[10px] text-muted-foreground mt-0.5 capitalize">{a.account_type}</div>
                        )}
                      </td>

                      {/* อุตสาหกรรม */}
                      <td className="px-4 py-3">
                        {a.industry ? (
                          <Badge className={`text-[11px] font-medium ${INDUSTRY_COLOR[a.industry] ?? "bg-muted text-muted-foreground"}`}>
                            {a.industry}
                          </Badge>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>

                      {/* ดีล */}
                      <td className="px-4 py-3">
                        {dealCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
                            <Building2 className="h-2.5 w-2.5" />
                            {dealCount}
                          </span>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>

                      {/* ผู้ติดต่อหลัก */}
                      <td className="px-4 py-3">
                        {primaryContact ? (
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
                              {initials}
                            </div>
                            <span className="truncate text-xs text-muted-foreground max-w-[120px]">
                              {primaryContact.name}
                            </span>
                          </div>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>

                      {/* เว็บไซต์ */}
                      <td className="px-4 py-3 text-xs" onClick={(e) => e.stopPropagation()}>
                        {a.website ? (
                          <a
                            href={a.website.startsWith("http") ? a.website : `https://${a.website}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline max-w-[140px]"
                          >
                            <ExternalLink className="h-3 w-3 shrink-0" />
                            <span className="truncate">{a.website.replace(/^https?:\/\//, "")}</span>
                          </a>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>

                      {/* โทรศัพท์ */}
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {a.phone ?? "—"}
                      </td>

                      {/* อัปเดต */}
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {formatThaiDate(a.updated_at)}
                      </td>

                      {/* Actions */}
                      <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                        <RowActions actions={[
                          stdOpen(() => navigate({ to: "/accounts/$accountId", params: { accountId: a.id } })),
                          stdDupe(() => duplicateAccount(a)),
                          stdDelete(() => deleteAccount(a.id)),
                        ]} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ListPagination
            page={page}
            pageSize={pageSize}
            total={pagedTotal}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}

      <NewAccountDialog open={newOpen} onOpenChange={setNewOpen} onSaved={() => { setNewOpen(false); load(); }} />
    </div>
  );
}

// ─── New Account Dialog ───────────────────────────────────────────────────────

export function NewAccountDialog({
  open, onOpenChange, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", industry: "", account_type: "", tax_id: "", website: "", phone: "", full_address: "", zip_code: "", credit_days: "", address: "",
  });

  useEffect(() => {
    if (open) setForm({ name: "", industry: "", account_type: "", tax_id: "", website: "", phone: "", full_address: "", zip_code: "", credit_days: "", address: "" });
  }, [open]);

  const submit = async () => {
    if (!form.name.trim()) return toast.error("กรุณาระบุชื่อบริษัท");
    setSaving(true);
    const { error } = await crmDb().from("accounts").insert({
      name: form.name.trim(),
      industry: form.industry || null,
      account_type: form.account_type || null,
      tax_id: form.tax_id.trim() || null,
      website: form.website.trim() || null,
      phone: form.phone.trim() || null,
      full_address: form.full_address.trim() || null,
      zip_code: form.zip_code.trim() || null,
      credit_days: form.credit_days ? parseInt(form.credit_days, 10) : null,
      address: form.address.trim() || null,
      owner_id: user?.id,
      created_by: user?.id,
    });
    setSaving(false);
    if (error) return toast.error("บันทึกไม่สำเร็จ", { description: error.message });
    toast.success("เพิ่มบริษัทแล้ว");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>เพิ่มบริษัทใหม่</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <Label className="text-xs">ชื่อบริษัท <span className="text-red-500">*</span></Label>
            <Input placeholder="บริษัท ABC จำกัด" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">เลขประจำตัวผู้เสียภาษี</Label>
            <Input placeholder="1234567890123" value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">อุตสาหกรรม</Label>
            <Select value={form.industry} onValueChange={(v) => setForm({ ...form, industry: v })}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="เลือกอุตสาหกรรม" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.filter((i) => i !== "ทั้งหมด").map((ind) => (
                  <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">ประเภทบัญชี</Label>
            <Select value={form.account_type} onValueChange={(v) => setForm({ ...form, account_type: v })}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="เลือกประเภทบัญชี" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">ลูกค้า</SelectItem>
                <SelectItem value="vendor">ผู้จำหน่าย</SelectItem>
                <SelectItem value="both">ลูกค้า + ผู้จำหน่าย</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">เว็บไซต์</Label>
              <Input placeholder="example.com" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">โทรศัพท์</Label>
              <Input placeholder="02-xxx-xxxx" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div>
            <Label className="text-xs">ที่อยู่เต็ม</Label>
            <Textarea placeholder="ที่อยู่บริษัท" value={form.full_address} onChange={(e) => setForm({ ...form, full_address: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">รหัสไปรษณีย์</Label>
              <Input placeholder="10110" value={form.zip_code} onChange={(e) => setForm({ ...form, zip_code: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">เครดิต (วัน)</Label>
              <Input type="number" placeholder="30" value={form.credit_days} onChange={(e) => setForm({ ...form, credit_days: e.target.value })} />
            </div>
          </div>
          <div>
            <Label className="text-xs">ที่อยู่ (ย่อ)</Label>
            <Input placeholder="ที่อยู่บริษัท" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              บันทึก
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
