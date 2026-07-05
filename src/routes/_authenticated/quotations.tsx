import { createFileRoute } from "@tanstack/react-router";
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
import { RowActions, stdEdit, stdDupe, stdDelete } from "@/components/ui/row-actions";
import { exportToCsv, quotationsToRows } from "@/lib/export-csv";
import { ListPagination, usePagination } from "@/components/list-pagination";

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

export const STATUS_DOT: Record<QuotationStatus, string> = {
  draft: "bg-muted-foreground",
  sent: "bg-blue-500",
  accepted: "bg-emerald-500",
  rejected: "bg-red-500",
  cancelled: "bg-muted-foreground",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

function QuotationsPage() {
  const { user, role } = useAuth();
  const confirm = useConfirm();
  const isManager = role === "manager" || role === "admin";
  const isAdmin = role === "admin";

  const [rows, setRows] = useState<Quotation[] | null>(null);
  const [leadsMap, setLeadsMap] = useState<Map<string, string>>(new Map());
  const [accountsMap, setAccountsMap] = useState<Map<string, string>>(new Map());
  const [profilesMap, setProfilesMap] = useState<Map<string, string>>(new Map());

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuotationStatus | "all">("all");

  const [newOpen, setNewOpen] = useState(false);
  const [faOpen, setFaOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Quotation | null>(null);

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

  const {
    page, setPage, pageSize, setPageSize, totalPages,
    total: pagedTotal, paged: pageItems,
  } = usePagination(filtered ?? [], 25);

  const handleExport = () => {
    if (!isManager) { toast.error("เฉพาะ Manager และ Admin เท่านั้นที่ Export ใบเสนอราคาได้"); return; }
    if (!isAdmin) { toast.error("ไม่มีสิทธิ์ Export — เฉพาะ Admin เท่านั้น"); return; }
    if (!filtered?.length) { toast.error("ไม่มีข้อมูลที่จะ export"); return; }
    const profMap = new Map(Array.from(profilesMap.entries()).map(([id, name]) => [id, { name: name ?? "" }]));
    const rows = quotationsToRows(filtered, leadsMap, accountsMap, profMap, STATUS_LABEL);
    exportToCsv(`quotations-${new Date().toISOString().slice(0,10)}.csv`, rows);
    toast.success(`Export ${filtered.length} รายการแล้ว`);
  };

  const openEdit = (r: Quotation) => {
    setEditTarget(r);
    setNewOpen(true);
  };

  return (
    <div className="p-6 page-fade-in space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">ใบเสนอราคา</h1>
          <p className="text-xs text-muted-foreground">
            {rows == null ? "กำลังโหลด…" : `${rows.length} รายการ`}
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={handleExport}
              disabled={!filtered?.length || !isManager}
              title={!isManager ? "เฉพาะ Manager/Admin" : "Export CSV"}>
              <Download className="mr-1.5 h-4 w-4" /> Export CSV
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setFaOpen(true)}>
            <FileDown className="mr-1.5 h-4 w-4" /> Import FA
          </Button>
          <Button size="sm" onClick={() => { setEditTarget(null); setNewOpen(true); }}>
            <Plus className="mr-1.5 h-4 w-4" /> สร้างใหม่
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 w-60 pl-8 text-sm bg-background"
            placeholder="ค้นหา เลขที่ / ชื่อ / บริษัท"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as QuotationStatus | "all")}>
          <SelectTrigger className="h-9 w-36 text-xs bg-background">
            <SelectValue placeholder="สถานะ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทั้งหมด</SelectItem>
            {(Object.keys(STATUS_LABEL) as QuotationStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium w-28">วันที่</th>
                  <th className="px-4 py-3 text-left font-medium">เลขที่เอกสาร</th>
                  <th className="px-4 py-3 text-left font-medium">ชื่อลูกค้า / ชื่อโปรเจ็ค</th>
                  <th className="px-4 py-3 text-right font-medium">ยอดรวมสุทธิ</th>
                  <th className="px-4 py-3 text-left font-medium w-32">สถานะ</th>
                  <th className="px-3 py-3 text-right w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pageItems.map((r) => (
                  <QuotationRow
                    key={r.id}
                    row={r}
                    accountName={r.account_id ? accountsMap.get(r.account_id) : undefined}
                    onEdit={() => openEdit(r)}
                    onDelete={() => deleteQuotation(r.id)}
                    onDuplicate={() => duplicateQuotation(r)}
                  />
                ))}
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
        คลิกแถวเพื่อดูรายละเอียดใบเสนอราคา
      </p>

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
  row, accountName, onEdit, onDelete, onDuplicate,
}: {
  row: Quotation;
  accountName?: string;
  onEdit: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
}) {
  const expired = row.valid_until && new Date(row.valid_until).getTime() < Date.now();

  return (
    <tr
      className="group hover:bg-muted/40 transition-colors cursor-pointer"
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('[role="menuitem"]')) return;
        onEdit();
      }}
    >
      <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
        {formatThaiDate(row.issued_date)}
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium text-foreground">
            {row.quotation_no ?? "—"}
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {row.source === "flowaccount" ? "FlowAccount" : "CRM"}
        </div>
      </td>
      <td className="px-4 py-3.5 max-w-[420px]">
        <div className="truncate font-medium text-foreground">{accountName ?? "—"}</div>
        {row.title && row.title !== accountName && (
          <div className="truncate text-xs text-muted-foreground">{row.title}</div>
        )}
      </td>
      <td className="px-4 py-3.5 text-right text-sm font-medium tabular-nums whitespace-nowrap text-foreground">
        {formatBaht(row.grand_total)}
        {expired && (
          <div className="text-[10px] text-red-500 font-normal">หมดอายุ</div>
        )}
      </td>
      <td className="px-4 py-3.5 w-32">
        <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[row.status]}`} />
          {STATUS_LABEL[row.status]}
        </span>
      </td>
      <td className="px-3 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
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
  const [leads, setLeads] = useState<{ id: string; title: string; account_id: string | null; owner_id: string | null }[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; full_name: string | null }[]>([]);

  // Resolved account/owner from selected lead
  const [resolvedAccount, setResolvedAccount] = useState<{ id: string; name: string } | null>(null);

  const blank = {
    lead_id:      prefillLeadId ?? "",
    account_id:   "",
    quotation_no: "",
    title:        "",
    subtotal:     "",
    discount:     "0",
    vat_amount:   "0",
    grand_total:  "",
    status:       "draft" as QuotationStatus,
    issued_date:  new Date().toISOString().slice(0, 10),
    valid_until:  "",
    owner_id:     user?.id ?? "",
    notes:        "",
  };

  const [form, setForm] = useState(blank);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        lead_id:      initial.lead_id ?? "",
        account_id:   initial.account_id ?? "",
        quotation_no: initial.quotation_no ?? "",
        title:        initial.title,
        subtotal:     initial.subtotal != null ? String(initial.subtotal) : "",
        discount:     initial.discount != null ? String(initial.discount) : "0",
        vat_amount:   initial.vat_amount != null ? String(initial.vat_amount) : "0",
        grand_total:  initial.grand_total != null ? String(initial.grand_total) : "",
        status:       initial.status,
        issued_date:  initial.issued_date ?? new Date().toISOString().slice(0, 10),
        valid_until:  initial.valid_until ?? "",
        owner_id:     initial.owner_id ?? user?.id ?? "",
        notes:        initial.notes ?? "",
      });
    } else {
      setForm({ ...blank, lead_id: prefillLeadId ?? "" });
    }
    (async () => {
      const [lRes, aRes, pRes] = await Promise.all([
        crmDb().from("leads").select("id,title,account_id,owner_id").order("title"),
        crmDb().from("accounts").select("id,name").order("name"),
        crmDb().from("user_profiles").select("id,full_name").eq("is_active", true),
      ]);
      setLeads(lRes.data ?? []);
      setAccounts(aRes.data ?? []);
      setProfiles(pRes.data ?? []);
    })();
  // eslint-disable-next-line
  }, [open]);

  // When lead changes → auto-fill account_id and owner_id
  const handleLeadChange = (leadId: string) => {
    if (leadId === "none" || !leadId) {
      setForm((f) => ({ ...f, lead_id: "", account_id: "" }));
      setResolvedAccount(null);
      return;
    }
    const lead = leads.find((l) => l.id === leadId);
    const accId = lead?.account_id ?? "";
    const acc = accounts.find((a) => a.id === accId) ?? null;
    setResolvedAccount(acc);
    setForm((f) => ({
      ...f,
      lead_id:    leadId,
      account_id: accId,
      // Auto-fill owner only if not already set
      owner_id:   f.owner_id || lead?.owner_id || f.owner_id,
    }));
  };

  // Sync resolvedAccount when editing existing quotation (after accounts load)
  useEffect(() => {
    if (form.account_id && accounts.length > 0 && !resolvedAccount) {
      const acc = accounts.find((a) => a.id === form.account_id);
      if (acc) setResolvedAccount(acc);
    }
  }, [accounts, form.account_id]);

  const recalc = (patch: Partial<typeof form>) => {
    const merged = { ...form, ...patch };
    const sub  = parseFloat(merged.subtotal)   || 0;
    const disc = parseFloat(merged.discount)   || 0;
    const vat  = parseFloat(merged.vat_amount) || 0;
    const gt   = sub - disc + vat;
    return { ...merged, grand_total: (sub || disc || vat) ? String(Math.round(gt * 100) / 100) : merged.grand_total };
  };

  const submit = async () => {
    if (!form.title.trim()) return toast.error("กรุณาระบุชื่อใบเสนอราคา");
    setSaving(true);
    const payload: any = {
      lead_id:       form.lead_id || null,
      account_id:    form.account_id || null,
      quotation_no:  form.quotation_no.trim() || null,
      title:         form.title.trim(),
      source:        "crm",
      subtotal:      form.subtotal    ? parseFloat(form.subtotal)    : null,
      discount:      form.discount    ? parseFloat(form.discount)    : 0,
      vat_amount:    form.vat_amount  ? parseFloat(form.vat_amount)  : 0,
      grand_total:   form.grand_total ? parseFloat(form.grand_total) : null,
      status:        form.status,
      issued_date:   form.issued_date  || null,
      valid_until:   form.valid_until  || null,
      owner_id:      form.owner_id || user?.id || null,
      notes:         form.notes.trim() || null,
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

  // Leads that have no lead selected = show standalone account picker
  const showStandaloneAccount = !form.lead_id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "แก้ไขใบเสนอราคา" : "สร้างใบเสนอราคาใหม่"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 pt-1">

          {/* ── คอลัมน์ซ้าย: ข้อมูลหลัก ── */}
          <div className="space-y-3">

            {/* 1. Lead */}
            <div>
              <Label className="text-xs">ดีล (Lead)</Label>
              <Select value={form.lead_id || "none"} onValueChange={handleLeadChange}>
                <SelectTrigger><SelectValue placeholder="— ไม่ระบุ —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                  {leads.map((l) => <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>)}
                </SelectContent>
              </Select>
              {resolvedAccount && (
                <div className="mt-1.5 flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-1.5">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                    {resolvedAccount.name.slice(0, 1)}
                  </div>
                  <span className="text-xs font-medium truncate">{resolvedAccount.name}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground shrink-0">auto</span>
                </div>
              )}
            </div>

            {/* บริษัท standalone */}
            {showStandaloneAccount && (
              <div>
                <Label className="text-xs">บริษัท <span className="text-muted-foreground">(ถ้าไม่มีดีล)</span></Label>
                <Select value={form.account_id || "none"} onValueChange={(v) => setForm({ ...form, account_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="— ไม่ระบุ —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                    {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* 2. ชื่อ/รายละเอียด */}
            <div>
              <Label className="text-xs">ชื่อ / รายละเอียด <span className="text-red-500">*</span></Label>
              <Input
                placeholder="เช่น โปรเจกต์ AI สำหรับฝ่ายโลจิสติกส์"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>

            {/* 3. เลขที่ QT + สถานะ */}
            <div className="grid grid-cols-2 gap-2">
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

            {/* 4. มอบหมาย */}
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

            {/* 5. หมายเหตุ */}
            <div>
              <Label className="text-xs">หมายเหตุ</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="รายละเอียดเพิ่มเติม" />
            </div>
          </div>

          {/* ── คอลัมน์ขวา: ราคา + วันที่ ── */}
          <div className="space-y-3">

            {/* ยอดรวม — แสดงเด่นขึ้น */}
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">ราคา</div>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">ราคาก่อน VAT</Label>
                  <Input type="number" value={form.subtotal}
                    onChange={(e) => setForm(recalc({ subtotal: e.target.value }))}
                    placeholder="0" className="bg-background" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">ส่วนลด</Label>
                    <Input type="number" value={form.discount}
                      onChange={(e) => setForm(recalc({ discount: e.target.value }))}
                      placeholder="0" className="bg-background" />
                  </div>
                  <div>
                    <Label className="text-xs">VAT</Label>
                    <Input type="number" value={form.vat_amount}
                      onChange={(e) => setForm(recalc({ vat_amount: e.target.value }))}
                      placeholder="0" className="bg-background" />
                  </div>
                </div>
                <div className="border-t pt-2">
                  <Label className="text-xs">ยอดรวมสุทธิ (บาท)</Label>
                  <Input type="number" value={form.grand_total}
                    onChange={(e) => setForm({ ...form, grand_total: e.target.value })}
                    placeholder="คำนวณอัตโนมัติ" className="bg-background" />
                  {form.grand_total && (
                    <div className="mt-1.5 text-xl font-bold text-primary">
                      {formatBaht(parseFloat(form.grand_total))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* วันที่ */}
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">วันที่</div>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">วันที่ออก</Label>
                  <Input type="date" value={form.issued_date}
                    onChange={(e) => setForm({ ...form, issued_date: e.target.value })}
                    className="bg-background" />
                </div>
                <div>
                  <Label className="text-xs">ใช้ได้ถึง</Label>
                  <Input type="date" value={form.valid_until}
                    onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
                    className="bg-background" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t pt-4 mt-1">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {isEdit ? "บันทึก" : "สร้าง"}
          </Button>
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
  const [leads, setLeads] = useState<{ id: string; title: string; account_id: string | null }[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<FADocument | null>(null);
  const [q, setQ] = useState("");

  const [form, setForm] = useState({
    lead_id:      prefillLeadId ?? "",
    account_id:   "",
    title:        "",
    quotation_no: "",
    grand_total:  "",
    issued_date:  "",
    valid_until:  "",
  });

  // Resolved account from lead
  const [resolvedAccount, setResolvedAccount] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setQ("");
    setLoading(true);
    (async () => {
      try {
        const [docsData, lRes, aRes] = await Promise.all([
          fetchFADocuments(),
          crmDb().from("leads").select("id,title,account_id").order("title"),
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

  // Auto-resolve prefillLeadId → account once data loads
  useEffect(() => {
    if (!prefillLeadId || accounts.length === 0 || leads.length === 0) return;
    const lead = leads.find((l) => l.id === prefillLeadId);
    if (!lead?.account_id) return;
    const acc = accounts.find((a) => a.id === lead.account_id);
    if (acc && !resolvedAccount) {
      setResolvedAccount(acc);
      setForm((f) => ({ ...f, lead_id: prefillLeadId, account_id: lead.account_id! }));
    }
  // eslint-disable-next-line
  }, [accounts, leads]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return docs;
    return docs.filter((d) =>
      (d.document_serial ?? "").toLowerCase().includes(needle) ||
      (d.contact_name    ?? "").toLowerCase().includes(needle)
    );
  }, [docs, q]);

  // When lead changes → auto-fill account
  const handleLeadChange = (leadId: string) => {
    if (leadId === "none" || !leadId) {
      setForm((f) => ({ ...f, lead_id: "", account_id: "" }));
      setResolvedAccount(null);
      return;
    }
    const lead = leads.find((l) => l.id === leadId);
    const accId = lead?.account_id ?? "";
    const acc = accounts.find((a) => a.id === accId) ?? null;
    setResolvedAccount(acc);
    setForm((f) => ({ ...f, lead_id: leadId, account_id: accId }));
  };

  const pickDoc = (d: FADocument) => {
    setSelected(d);
    // Try to match account from FA contact name if no lead selected
    const matchAcc = !form.lead_id
      ? accounts.find((a) => a.name.trim().toLowerCase() === (d.contact_name ?? "").trim().toLowerCase())
      : null;
    if (matchAcc && !form.lead_id) {
      setResolvedAccount(matchAcc);
    }
    setForm((f) => ({
      ...f,
      account_id:   f.lead_id ? f.account_id : (matchAcc?.id ?? ""),
      title:        `${d.contact_name ?? "ลูกค้า"} — ${d.document_serial}`,
      quotation_no: d.document_serial,
      grand_total:  d.grand_total != null ? String(d.grand_total) : "",
      issued_date:  d.published_on ? d.published_on.slice(0, 10) : "",
      valid_until:  "",
    }));
  };

  const submit = async () => {
    if (!selected) return;
    setSaving(true);
    const { error } = await crmDb().from("quotations").insert({
      lead_id:       form.lead_id      || null,
      account_id:    form.account_id   || null,
      quotation_no:  form.quotation_no || selected.document_serial,
      title:         form.title,
      source:        "flowaccount",
      fa_inbound_id: selected.id,
      grand_total:   form.grand_total ? parseFloat(form.grand_total) : null,
      status:        "sent",
      issued_date:   form.issued_date  || null,
      valid_until:   form.valid_until  || null,
      owner_id:      user?.id,
      created_by:    user?.id,
      fa_raw:        selected.raw_data,
    });
    setSaving(false);
    if (error) return toast.error("Import ไม่สำเร็จ", { description: error.message });
    toast.success(`Import ${selected.document_serial} แล้ว`);
    onImported();
  };

  const showStandaloneAccount = !form.lead_id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import ใบเสนอราคาจาก FlowAccount</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          {/* Left: FA document list */}
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
                        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold bg-muted text-muted-foreground">
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

          {/* Right: form */}
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

                {/* ── Lead (อันดับแรก) ── */}
                <div>
                  <Label className="text-xs">ดีล (Lead)</Label>
                  <Select value={form.lead_id || "none"} onValueChange={handleLeadChange}>
                    <SelectTrigger><SelectValue placeholder="— ไม่ระบุ —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                      {leads.map((l) => <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {/* Auto-filled account info card */}
                  {resolvedAccount && (
                    <div className="mt-1.5 flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                        {resolvedAccount.name.slice(0, 1)}
                      </div>
                      <span className="text-xs font-medium">{resolvedAccount.name}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">บริษัท (auto)</span>
                    </div>
                  )}
                </div>

                {/* Standalone account — เฉพาะเมื่อไม่เลือก Lead */}
                {showStandaloneAccount && (
                  <div>
                    <Label className="text-xs">บริษัท <span className="text-muted-foreground">(ถ้าไม่มีดีล)</span></Label>
                    <Select value={form.account_id || "none"} onValueChange={(v) => setForm({ ...form, account_id: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="— ไม่ระบุ —" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                        {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <Label className="text-xs">ชื่อ</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">ยอดรวม</Label>
                    <Input type="number" value={form.grand_total}  onChange={(e) => setForm({ ...form, grand_total: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">วันที่ออก</Label>
                    <Input type="date"   value={form.issued_date}  onChange={(e) => setForm({ ...form, issued_date: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">ใช้ได้ถึง</Label>
                  <Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
                </div>
                <div className="flex justify-end gap-2 border-t pt-3">
                  <Button variant="ghost" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
                  <Button onClick={submit} disabled={saving || !selected}>
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
