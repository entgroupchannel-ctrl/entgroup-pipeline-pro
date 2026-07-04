import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2, Plus, Search, FileText, FileDown, ChevronDown, Trash2, Download,
} from "lucide-react";
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
import { formatBaht, formatThaiDate } from "@/lib/format";
import { fetchFADocuments, type FADocument } from "@/lib/flowaccount-client";
import { RowActions, BulkActionBar, stdEdit, stdDupe, stdDelete } from "@/components/ui/row-actions";
import { exportToCsv, quotationsToRows } from "@/lib/export-csv";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/quotations")({
  component: QuotationsPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Quotation {
  id: string;
  lead_id: string | null;
  account_id: string | null;
  quotation_no: string | null;
  title: string;
  source: "crm" | "flowaccount";
  fa_inbound_id: string | null;
  subtotal: number | null;
  discount: number | null;
  vat_amount: number | null;
  grand_total: number | null;
  status: QuotationStatus;
  issued_date: string | null;
  valid_until: string | null;
  owner_id: string | null;
  created_by: string | null;
  notes: string | null;
  fa_raw: any;
  created_at: string;
  updated_at: string;
}

export type QuotationStatus = "draft" | "sent" | "accepted" | "rejected" | "cancelled";

export const STATUS_LABEL: Record<QuotationStatus, string> = {
  draft: "ร่าง",
  sent: "ส่งแล้ว",
  accepted: "อนุมัติ",
  rejected: "ปฏิเสธ",
  cancelled: "ยกเลิก",
};

export const STATUS_COLOR: Record<QuotationStatus, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  accepted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  cancelled: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

function QuotationsPage() {
  const { user, role } = useAuth();
  const confirm = useConfirm();
  const isManager = role === "manager" || role === "admin";

  const [rows, setRows] = useState<Quotation[] | null>(null);
  const [leadsMap, setLeadsMap] = useState<Map<string, string>>(new Map());
  const [accountsMap, setAccountsMap] = useState<Map<string, string>>(new Map());
  const [profilesMap, setProfilesMap] = useState<Map<string, string>>(new Map());

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuotationStatus | "all">("all");

  const [newOpen, setNewOpen] = useState(false);
  const [faOpen, setFaOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Quotation | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = async () => {
    let qb = crmDb().from("quotations").select("*").order("created_at", { ascending: false });
    if (!isManager && user) qb = qb.or(`owner_id.eq.${user.id},created_by.eq.${user.id}`);
    const [qRes, leadsRes, accRes, profRes] = await Promise.all([
      qb,
      crmDb().from("leads").select("id,title"),
      crmDb().from("accounts").select("id,name"),
      crmDb().from("user_profiles").select("id,full_name"),
    ]);
    if (qRes.error) return toast.error("โหลดใบเสนอราคาไม่สำเร็จ", { description: qRes.error.message });
    setRows((qRes.data ?? []) as Quotation[]);
    setLeadsMap(new Map((leadsRes.data ?? []).map((l: any) => [l.id, l.title])));
    setAccountsMap(new Map((accRes.data ?? []).map((a: any) => [a.id, a.name])));
    setProfilesMap(new Map((profRes.data ?? []).map((p: any) => [p.id, p.full_name])));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id, isManager]);

  const toggleSelect = (id: string) => setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const selectAll = () => setSelected(new Set((filtered ?? []).map(r => r.id)));
  const clearAll  = () => setSelected(new Set());

  const deleteQuotation = async (id: string) => {
    const _ok = await confirm({ title: "ลบใบเสนอราคานี้?", variant: "danger" });
    if (!_ok) return;
    const { error } = await crmDb().from("quotations").delete().eq("id", id);
    if (error) { toast.error("ลบไม่สำเร็จ"); return; }
    toast.success("ลบแล้ว"); load();
  };

  const duplicateQuotation = async (r: Quotation) => {
    const { error } = await crmDb().from("quotations").insert({
      lead_id: r.lead_id, account_id: r.account_id,
      title: `${r.title} (สำเนา)`, source: "crm",
      subtotal: r.subtotal, discount: r.discount, vat_amount: r.vat_amount,
      grand_total: r.grand_total, status: "draft",
      issued_date: new Date().toISOString().slice(0, 10),
      owner_id: r.owner_id, created_by: user?.id,
    });
    if (error) { toast.error("สร้างซ้ำไม่สำเร็จ"); return; }
    toast.success("สร้างซ้ำแล้ว"); load();
  };

  const bulkDelete = async () => {
    const _ok = await confirm({ title: `ลบ ${selected.size} รายการ?`, variant: "danger" });
    if (!_ok) return;
    const ids = Array.from(selected);
    const { error } = await crmDb().from("quotations").delete().in("id", ids);
    if (error) { toast.error("ลบไม่สำเร็จ"); return; }
    toast.success(`ลบ ${ids.length} รายการแล้ว`); clearAll(); load();
  };

  const bulkUpdateStatus = async (status: QuotationStatus) => {
    const ids = Array.from(selected);
    const { error } = await crmDb().from("quotations").update({ status }).in("id", ids);
    if (error) { toast.error("อัปเดตไม่สำเร็จ"); return; }
    toast.success(`อัปเดต ${ids.length} รายการเป็น ${STATUS_LABEL[status]} แล้ว`); clearAll(); load();
  };

  const filtered = useMemo(() => {
    if (!rows) return null;
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        (r.quotation_no ?? "").toLowerCase().includes(needle) ||
        r.title.toLowerCase().includes(needle) ||
        (r.account_id ? (accountsMap.get(r.account_id) ?? "").toLowerCase().includes(needle) : false)
      );
    });
  }, [rows, q, statusFilter, accountsMap]);

  const updateStatus = async (id: string, status: QuotationStatus) => {
    const { error } = await crmDb().from("quotations").update({ status }).eq("id", id);
    if (error) return toast.error("อัปเดตสถานะไม่สำเร็จ", { description: error.message });
    toast.success("อัปเดตสถานะแล้ว");
    load();
  };

  const handleExport = () => {
    if (!filtered?.length) { toast.error("ไม่มีข้อมูลที่จะ export"); return; }
    const profMap = new Map(Array.from(profilesMap.entries()).map(([id, name]) => [id, { name: name ?? "" }]));
    const rows = quotationsToRows(filtered, leadsMap, accountsMap, profMap, STATUS_LABEL);
    exportToCsv(`quotations-${new Date().toISOString().slice(0,10)}.csv`, rows);
    toast.success(`Export ${filtered.length} รายการแล้ว`);
  };

  return (
    <div className="p-6 page-fade-in">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">ใบเสนอราคา</h1>
          <p className="text-xs text-muted-foreground">
            {rows == null ? "กำลังโหลด…" : `${rows.length} รายการ`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!filtered?.length}>
            <Download className="mr-1.5 h-4 w-4" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => setFaOpen(true)}>
            <FileDown className="mr-1.5 h-4 w-4" /> Import FA
          </Button>
          <Button size="sm" onClick={() => { setEditTarget(null); setNewOpen(true); }}>
            <Plus className="mr-1.5 h-4 w-4" /> สร้างใหม่
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 w-60 pl-8 text-sm"
            placeholder="ค้นหา เลขที่ / ชื่อ / บริษัท"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {(["all", "draft", "sent", "accepted", "rejected", "cancelled"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                statusFilter === s
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              }`}
            >
              {s === "all" ? "ทั้งหมด" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <BulkActionBar
        count={selected.size}
        total={filtered?.length ?? 0}
        onSelectAll={selectAll}
        onClearAll={clearAll}
        actions={[
          { label: "ส่งแล้ว", onClick: () => bulkUpdateStatus("sent") },
          { label: "อนุมัติ", onClick: () => bulkUpdateStatus("accepted") },
          { label: "ลบที่เลือก", icon: <Trash2 className="h-3.5 w-3.5" />, onClick: bulkDelete, variant: "danger" },
        ]}
      />

      {filtered === null ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          <FileText className="mx-auto mb-2 h-8 w-8 opacity-30" />
          ไม่พบใบเสนอราคา
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="px-3 py-2.5 w-8"><Checkbox checked={!!filtered?.length && selected.size === filtered.length} onCheckedChange={(v) => v ? selectAll() : clearAll()} /></th>
                  <th className="px-4 py-2.5 text-left font-medium">เลขที่</th>
                  <th className="px-4 py-2.5 text-left font-medium">ชื่อ / บริษัท</th>
                  <th className="px-4 py-2.5 text-left font-medium">ดีล</th>
                  <th className="px-4 py-2.5 text-right font-medium">มูลค่า</th>
                  <th className="px-4 py-2.5 text-center font-medium">แหล่ง</th>
                  <th className="px-4 py-2.5 text-center font-medium">สถานะ</th>
                  <th className="px-4 py-2.5 text-left font-medium">วันที่ออก</th>
                  <th className="px-4 py-2.5 text-left font-medium">ใช้ได้ถึง</th>
                  <th className="px-4 py-2.5 text-left font-medium">เจ้าของ</th>
                  <th className="px-2 py-2.5 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((r) => (
                  <QuotationRow
                    key={r.id}
                    row={r}
                    selected={selected.has(r.id)}
                    onSelect={() => toggleSelect(r.id)}
                    leadTitle={r.lead_id ? leadsMap.get(r.lead_id) : undefined}
                    accountName={r.account_id ? accountsMap.get(r.account_id) : undefined}
                    ownerName={r.owner_id ? profilesMap.get(r.owner_id) : undefined}
                    onEdit={() => { setEditTarget(r); setNewOpen(true); }}
                    onStatusChange={(s) => updateStatus(r.id, s)}
                    onDelete={() => deleteQuotation(r.id)}
                    onDuplicate={() => duplicateQuotation(r)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <QuotationFormDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        initial={editTarget}
        onSaved={() => { setNewOpen(false); setEditTarget(null); load(); }}
      />
      <FAImportToQuotationDialog
        open={faOpen}
        onOpenChange={setFaOpen}
        onImported={() => { setFaOpen(false); load(); }}
      />
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function QuotationRow({
  row, selected, onSelect, leadTitle, accountName, ownerName, onEdit, onStatusChange, onDelete, onDuplicate,
}: {
  row: Quotation;
  selected?: boolean;
  onSelect?: () => void;
  leadTitle?: string;
  accountName?: string;
  ownerName?: string;
  onEdit: () => void;
  onStatusChange: (s: QuotationStatus) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
}) {
  const [statusOpen, setStatusOpen] = useState(false);

  return (
    <tr className={`hover:bg-muted/30 transition-colors ${selected ? "bg-primary/5" : ""}`}>
      <td className="px-3 py-3"><Checkbox checked={!!selected} onCheckedChange={() => onSelect?.()} /></td>
      <td className="px-4 py-3">
        <span className="font-mono text-xs font-semibold text-muted-foreground">
          {row.quotation_no ?? "—"}
        </span>
      </td>
      <td className="px-4 py-3 max-w-[200px]">
        <div className="truncate font-medium">{row.title}</div>
        {accountName && <div className="truncate text-xs text-muted-foreground">{accountName}</div>}
      </td>
      <td className="px-4 py-3">
        {row.lead_id && leadTitle ? (
          <Link
            to="/leads/$leadId"
            params={{ leadId: row.lead_id }}
            className="max-w-[140px] truncate block text-xs text-primary hover:underline"
          >
            {leadTitle}
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right font-medium">
        {formatBaht(row.grand_total)}
      </td>
      <td className="px-4 py-3 text-center">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
            row.source === "flowaccount"
              ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
              : "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
          }`}
        >
          {row.source === "flowaccount" ? "FA" : "CRM"}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        <div className="relative inline-block">
          <button
            onClick={() => setStatusOpen((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[row.status]}`}
          >
            {STATUS_LABEL[row.status]}
            <ChevronDown className="h-3 w-3" />
          </button>
          {statusOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setStatusOpen(false)} />
              <div className="absolute left-0 top-full z-20 mt-1 rounded-lg border bg-popover py-1 shadow-md min-w-[120px]">
                {(Object.keys(STATUS_LABEL) as QuotationStatus[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => { setStatusOpen(false); onStatusChange(s); }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted"
                  >
                    <span className={`h-2 w-2 rounded-full ${STATUS_COLOR[s].split(" ")[0]}`} />
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {formatThaiDate(row.issued_date)}
      </td>
      <td className="px-4 py-3 text-xs">
        {row.valid_until ? (
          <span className={
            new Date(row.valid_until).getTime() < Date.now()
              ? "font-medium text-red-600"
              : "text-muted-foreground"
          }>
            {formatThaiDate(row.valid_until)}
          </span>
        ) : <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {ownerName ?? "—"}
      </td>
      <td className="px-2 py-3">
        <RowActions actions={[
          stdEdit(onEdit),
          stdDupe(onDuplicate ?? (() => {})),
          stdDelete(onDelete ?? (() => {})),
        ]} />
      </td>
    </tr>
  );
}

// ─── CRM Form Dialog (exported for Lead Detail reuse) ─────────────────────────

export function QuotationFormDialog({
  open, onOpenChange, initial, onSaved, prefillLeadId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: Quotation | null;
  onSaved: () => void;
  prefillLeadId?: string;
}) {
  const { user } = useAuth();
  const isEdit = !!initial;

  const [saving, setSaving] = useState(false);
  const [leads, setLeads] = useState<{ id: string; title: string }[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; full_name: string | null }[]>([]);

  const blank = {
    lead_id: prefillLeadId ?? "",
    account_id: "",
    quotation_no: "",
    title: "",
    subtotal: "",
    discount: "0",
    vat_amount: "0",
    grand_total: "",
    status: "draft" as QuotationStatus,
    issued_date: new Date().toISOString().slice(0, 10),
    valid_until: "",
    owner_id: user?.id ?? "",
    notes: "",
  };

  const [form, setForm] = useState(blank);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        lead_id: initial.lead_id ?? "",
        account_id: initial.account_id ?? "",
        quotation_no: initial.quotation_no ?? "",
        title: initial.title,
        subtotal: initial.subtotal != null ? String(initial.subtotal) : "",
        discount: initial.discount != null ? String(initial.discount) : "0",
        vat_amount: initial.vat_amount != null ? String(initial.vat_amount) : "0",
        grand_total: initial.grand_total != null ? String(initial.grand_total) : "",
        status: initial.status,
        issued_date: initial.issued_date ?? new Date().toISOString().slice(0, 10),
        valid_until: initial.valid_until ?? "",
        owner_id: initial.owner_id ?? user?.id ?? "",
        notes: initial.notes ?? "",
      });
    } else {
      setForm({ ...blank, lead_id: prefillLeadId ?? "" });
    }
    (async () => {
      const [lRes, aRes, pRes] = await Promise.all([
        crmDb().from("leads").select("id,title").order("title"),
        crmDb().from("accounts").select("id,name").order("name"),
        crmDb().from("user_profiles").select("id,full_name").eq("is_active", true),
      ]);
      setLeads(lRes.data ?? []);
      setAccounts(aRes.data ?? []);
      setProfiles(pRes.data ?? []);
    })();
  // eslint-disable-next-line
  }, [open]);

  const recalc = (patch: Partial<typeof form>) => {
    const merged = { ...form, ...patch };
    const sub = parseFloat(merged.subtotal) || 0;
    const disc = parseFloat(merged.discount) || 0;
    const vat = parseFloat(merged.vat_amount) || 0;
    const gt = sub - disc + vat;
    return { ...merged, grand_total: (sub || disc || vat) ? String(Math.round(gt * 100) / 100) : merged.grand_total };
  };

  const submit = async () => {
    if (!form.title.trim()) return toast.error("กรุณาระบุชื่อใบเสนอราคา");
    setSaving(true);
    const payload: any = {
      lead_id: form.lead_id || null,
      account_id: form.account_id || null,
      quotation_no: form.quotation_no.trim() || null,
      title: form.title.trim(),
      source: "crm",
      subtotal: form.subtotal ? parseFloat(form.subtotal) : null,
      discount: form.discount ? parseFloat(form.discount) : 0,
      vat_amount: form.vat_amount ? parseFloat(form.vat_amount) : 0,
      grand_total: form.grand_total ? parseFloat(form.grand_total) : null,
      status: form.status,
      issued_date: form.issued_date || null,
      valid_until: form.valid_until || null,
      owner_id: form.owner_id || user?.id || null,
      notes: form.notes.trim() || null,
    };
    let error;
    if (isEdit && initial) {
      ({ error } = await crmDb().from("quotations").update(payload).eq("id", initial.id));
    } else {
      payload.created_by = user?.id;
      ({ error } = await crmDb().from("quotations").insert(payload));
    }
    setSaving(false);
    if (error) return toast.error("บันทึกไม่สำเร็จ", { description: error.message });
    toast.success(isEdit ? "แก้ไขแล้ว" : "สร้างใบเสนอราคาแล้ว");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "แก้ไขใบเสนอราคา" : "สร้างใบเสนอราคาใหม่"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">เลขที่ QT</Label>
              <Input
                placeholder="QT-2026-001"
                value={form.quotation_no}
                onChange={(e) => setForm({ ...form, quotation_no: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">สถานะ</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as QuotationStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABEL) as QuotationStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">ชื่อ/รายละเอียด <span className="text-red-500">*</span></Label>
            <Input
              placeholder="ใบเสนอราคา — บริษัท XYZ"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">ดีล (Lead)</Label>
              <Select value={form.lead_id || "none"} onValueChange={(v) => setForm({ ...form, lead_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="ไม่ระบุ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                  {leads.map((l) => <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">บริษัท</Label>
              <Select value={form.account_id || "none"} onValueChange={(v) => setForm({ ...form, account_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="ไม่ระบุ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">ราคาก่อน VAT</Label>
              <Input type="number" value={form.subtotal} onChange={(e) => setForm(recalc({ subtotal: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <Label className="text-xs">ส่วนลด</Label>
              <Input type="number" value={form.discount} onChange={(e) => setForm(recalc({ discount: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <Label className="text-xs">VAT</Label>
              <Input type="number" value={form.vat_amount} onChange={(e) => setForm(recalc({ vat_amount: e.target.value }))} placeholder="0" />
            </div>
          </div>
          <div>
            <Label className="text-xs">ยอดรวมสุทธิ (บาท)</Label>
            <Input
              type="number"
              value={form.grand_total}
              onChange={(e) => setForm({ ...form, grand_total: e.target.value })}
              placeholder="คำนวณอัตโนมัติ หรือกรอกเอง"
            />
            {form.grand_total && (
              <div className="mt-1 text-base font-semibold">{formatBaht(parseFloat(form.grand_total))}</div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">วันที่ออก</Label>
              <Input type="date" value={form.issued_date} onChange={(e) => setForm({ ...form, issued_date: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">ใช้ได้ถึง</Label>
              <Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
            </div>
          </div>
          <div>
            <Label className="text-xs">มอบหมาย</Label>
            <Select value={form.owner_id || "none"} onValueChange={(v) => setForm({ ...form, owner_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.id.slice(0, 8)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">หมายเหตุ</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="รายละเอียดเพิ่มเติม" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {isEdit ? "บันทึก" : "สร้าง"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── FA Import → Quotation (exported for Lead Detail reuse) ───────────────────

export function FAImportToQuotationDialog({
  open, onOpenChange, onImported, prefillLeadId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
  prefillLeadId?: string;
}) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [docs, setDocs] = useState<FADocument[]>([]);
  const [leads, setLeads] = useState<{ id: string; title: string }[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<FADocument | null>(null);
  const [q, setQ] = useState("");

  const [form, setForm] = useState({
    lead_id: prefillLeadId ?? "",
    account_id: "",
    title: "",
    quotation_no: "",
    grand_total: "",
    issued_date: "",
    valid_until: "",
  });

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setQ("");
    setLoading(true);
    (async () => {
      try {
        const [docsData, lRes, aRes] = await Promise.all([
          fetchFADocuments(),
          crmDb().from("leads").select("id,title").order("title"),
          crmDb().from("accounts").select("id,name").order("name"),
        ]);
        setDocs(docsData.filter((d) => d.document_type === "quotation"));
        setLeads(lRes.data ?? []);
        setAccounts(aRes.data ?? []);
      } catch (e: any) {
        toast.error("โหลดเอกสาร FA ไม่สำเร็จ", { description: e.message });
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line
  }, [open]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return docs;
    return docs.filter((d) =>
      (d.document_serial ?? "").toLowerCase().includes(needle) ||
      (d.contact_name ?? "").toLowerCase().includes(needle)
    );
  }, [docs, q]);

  const pickDoc = (d: FADocument) => {
    setSelected(d);
    const matchAcc = accounts.find(
      (a) => a.name.trim().toLowerCase() === (d.contact_name ?? "").trim().toLowerCase()
    );
    setForm({
      lead_id: prefillLeadId ?? "",
      account_id: matchAcc?.id ?? "",
      title: `${d.contact_name ?? "ลูกค้า"} — ${d.document_serial}`,
      quotation_no: d.document_serial,
      grand_total: d.grand_total != null ? String(d.grand_total) : "",
      issued_date: d.published_on ? d.published_on.slice(0, 10) : "",
      valid_until: "",
    });
  };

  const submit = async () => {
    if (!selected) return;
    setSaving(true);
    const { error } = await crmDb().from("quotations").insert({
      lead_id: form.lead_id || null,
      account_id: form.account_id || null,
      quotation_no: form.quotation_no || selected.document_serial,
      title: form.title,
      source: "flowaccount",
      fa_inbound_id: selected.id,
      grand_total: form.grand_total ? parseFloat(form.grand_total) : null,
      status: "sent",
      issued_date: form.issued_date || null,
      valid_until: form.valid_until || null,
      owner_id: user?.id,
      created_by: user?.id,
      fa_raw: selected.raw_data,
    });
    setSaving(false);
    if (error) return toast.error("Import ไม่สำเร็จ", { description: error.message });
    toast.success(`Import ${selected.document_serial} แล้ว`);
    onImported();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import ใบเสนอราคาจาก FlowAccount</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="ค้นหา เลขที่ / ชื่อลูกค้า" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="max-h-[400px] overflow-y-auto rounded-lg border">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">ไม่พบ Quotation ใน FA</div>
              ) : (
                <ul className="divide-y">
                  {filtered.map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => pickDoc(d)}
                        className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted/50 ${
                          selected?.id === d.id ? "bg-primary/5" : ""
                        }`}
                      >
                        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                          QT
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-xs font-semibold truncate">{d.document_serial}</div>
                          <div className="text-xs text-muted-foreground truncate">{d.contact_name ?? "—"}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-xs font-medium">{formatBaht(Number(d.grand_total ?? 0))}</div>
                          <div className="text-[10px] text-muted-foreground">{formatThaiDate(d.published_on)}</div>
                        </div>
                        {d.status_string && (
                          <Badge variant="secondary" className="h-5 shrink-0 text-[10px]">{d.status_string}</Badge>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="rounded-lg border bg-muted/20 p-4">
            {!selected ? (
              <div className="flex h-full min-h-[300px] items-center justify-center text-center text-sm text-muted-foreground">
                <div>
                  <FileText className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  เลือกเอกสารจากด้านซ้าย
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-mono text-sm font-semibold">{selected.document_serial}</div>
                  <Badge variant="outline">QT</Badge>
                </div>
                <div>
                  <Label className="text-xs">ชื่อ</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">ดีล (Lead)</Label>
                    <Select value={form.lead_id || "none"} onValueChange={(v) => setForm({ ...form, lead_id: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="ไม่ระบุ" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                        {leads.map((l) => <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">บริษัท</Label>
                    <Select value={form.account_id || "none"} onValueChange={(v) => setForm({ ...form, account_id: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="ไม่ระบุ" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                        {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">ยอดรวม</Label>
                    <Input type="number" value={form.grand_total} onChange={(e) => setForm({ ...form, grand_total: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">วันที่ออก</Label>
                    <Input type="date" value={form.issued_date} onChange={(e) => setForm({ ...form, issued_date: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">ใช้ได้ถึง</Label>
                  <Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" onClick={() => setSelected(null)}>ยกเลิก</Button>
                  <Button onClick={submit} disabled={saving}>
                    {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                    Import
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
