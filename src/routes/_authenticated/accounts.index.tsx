import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Plus, Building2, Crown, Trash2, Download, ExternalLink } from "lucide-react";
import { RowActions, stdDupe, stdDelete, stdOpen } from "@/components/ui/row-actions";
import { exportToCsv, accountsToRows } from "@/lib/export-csv";
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
import { usePermissions } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/accounts/")({
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

function AccountsPage() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const isManager = role === "manager" || role === "admin";
  const { can } = usePermissions();
  const canCreate = can("account.create");
  const canDelete = can("account.delete");
  const isAdmin = role === "admin";

  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [leadsCount, setLeadsCount] = useState<Map<string, number>>(new Map());
  const [q, setQ] = useState("");
  const [industryFilter, setIndustryFilter] = useState("ทั้งหมด");
  const [newOpen, setNewOpen] = useState(false);

  const load = async () => {
    // Supabase default limit = 1,000 — must fetch all pages manually
    const PAGE = 1000;
    let allAccounts: Account[] = [];
    let page = 0;
    while (true) {
      const { data, error } = await crmDb()
        .from("accounts")
        .select("*")
        .order("name")
        .range(page * PAGE, (page + 1) * PAGE - 1);
      if (error) {
        toast.error("โหลดรายชื่อลูกค้าไม่สำเร็จ", { description: error.message });
        return;
      }
      allAccounts = [...allAccounts, ...(data ?? []) as Account[]];
      if ((data ?? []).length < PAGE) break; // last page
      page++;
    }
    setAccounts(allAccounts);

    // Also fetch all leads (paginated)
    let allLeads: any[] = [];
    let lp = 0;
    while (true) {
      const { data } = await crmDb()
        .from("leads")
        .select("id,account_id")
        .range(lp * PAGE, (lp + 1) * PAGE - 1);
      allLeads = [...allLeads, ...(data ?? [])];
      if ((data ?? []).length < PAGE) break;
      lp++;
    }

    const counts = new Map<string, number>();
    allLeads.forEach((l: any) => {
      if (l.account_id) counts.set(l.account_id, (counts.get(l.account_id) ?? 0) + 1);
    });
    setLeadsCount(counts);
  };

  useEffect(() => { load(); }, []);

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
    <div className="p-6 page-fade-in space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">รายชื่อลูกค้า</h1>
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
          {canCreate && (
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> เพิ่มบริษัท
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 w-72 pl-8 text-sm bg-background"
            placeholder="ค้นหาชื่อบริษัท / อุตสาหกรรม / เลขประจำตัวผู้เสียภาษี"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <Select value={industryFilter} onValueChange={setIndustryFilter}>
          <SelectTrigger className="h-9 w-44 text-xs bg-background">
            <SelectValue placeholder="อุตสาหกรรม" />
          </SelectTrigger>
          <SelectContent>
            {INDUSTRIES.map((ind) => <SelectItem key={ind} value={ind}>{ind}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
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
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium">ชื่อบริษัท</th>
                  <th className="px-4 py-3 text-left font-medium">อุตสาหกรรม</th>
                  <th className="px-4 py-3 text-left font-medium w-24">ดีล</th>
                  <th className="px-4 py-3 text-left font-medium">โทรศัพท์</th>
                  <th className="px-3 py-3 text-right w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pageItems.map((a) => {
                  const dealCount = leadsCount.get(a.id) ?? 0;

                  return (
                    <tr
                      key={a.id}
                      className="group hover:bg-muted/40 transition-colors cursor-pointer"
                      onClick={() => navigate({ to: "/accounts/$accountId", params: { accountId: a.id } })}
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-foreground truncate max-w-[280px]">{a.name}</span>
                          {a.is_key_account && (
                            <span className="inline-flex items-center gap-0.5 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shrink-0">
                              <Crown className="h-2.5 w-2.5" /> Key
                            </span>
                          )}
                        </div>
                        {a.account_type && (
                          <div className="text-[11px] text-muted-foreground mt-0.5 capitalize">{a.account_type}</div>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-sm text-foreground">
                        {a.industry ?? <span className="text-muted-foreground">—</span>}
                      </td>

                      <td className="px-4 py-3.5 text-sm text-foreground">
                        {dealCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            {dealCount} ดีล
                          </span>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>

                      <td className="px-4 py-3.5 text-sm text-muted-foreground">
                        {a.phone ?? "—"}
                      </td>

                      <td className="px-3 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <RowActions actions={[
                          stdOpen(() => navigate({ to: "/accounts/$accountId", params: { accountId: a.id } })),
                          stdDupe(() => duplicateAccount(a)),
                          ...(canDelete ? [stdDelete(() => deleteAccount(a.id))] : []),
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

      <p className="text-xs text-muted-foreground text-center">
        คลิกแถวเพื่อดูรายละเอียดบริษัท
      </p>

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
