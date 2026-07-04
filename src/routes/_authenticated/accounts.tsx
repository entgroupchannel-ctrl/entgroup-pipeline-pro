import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Plus, Building2, Star, Crown , Trash2} from "lucide-react";
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
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";
import { formatThaiDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/accounts")({
  component: AccountsPage,
});

interface Account {
  id: string;
  name: string;
  industry: string | null;
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

function AccountsPage() {
  const { user, role } = useAuth();
  const confirm = useConfirm();
  const isManager = role === "manager" || role === "admin";

  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [leadsCount, setLeadsCount] = useState<Map<string, number>>(new Map());
  const [q, setQ] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = async () => {
    const [accRes, leadsRes] = await Promise.all([
      crmDb().from("accounts").select("*").order("name"),
      crmDb().from("leads").select("id,account_id"),
    ]);
    if (accRes.error) return toast.error("โหลดบริษัทไม่สำเร็จ", { description: accRes.error.message });
    setAccounts((accRes.data ?? []) as Account[]);

    // count leads per account
    const counts = new Map<string, number>();
    (leadsRes.data ?? []).forEach((l: any) => {
      if (l.account_id) counts.set(l.account_id, (counts.get(l.account_id) ?? 0) + 1);
    });
    setLeadsCount(counts);
  };

  useEffect(() => { load(); }, []);

  const toggleSelect = (id: string) => setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const selectAll = () => setSelected(new Set((filtered ?? []).map(a => a.id)));
  const clearAll  = () => setSelected(new Set());

  const duplicateAccount = async (a: Account) => {
    const { error } = await crmDb().from("accounts").insert({
      name: `${a.name} (สำเนา)`, industry: a.industry, website: a.website,
      phone: a.phone, address: a.address, owner_id: user?.id, created_by: user?.id,
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
    if (!needle) return accounts;
    return accounts.filter((a) =>
      a.name.toLowerCase().includes(needle) ||
      (a.industry ?? "").toLowerCase().includes(needle)
    );
  }, [accounts, q]);

  const handleExport = () => {
    if (!filtered?.length) { toast.error("ไม่มีข้อมูลที่จะ export"); return; }
    const profMap = new Map<string, { name: string }>(
      Array.from(new Set(filtered.map(a => a.owner_id).filter(Boolean))).map(id => [id, { name: id }])
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
          <h1 className="text-xl font-semibold">บริษัท</h1>
          <p className="text-xs text-muted-foreground">
            {filtered == null ? "กำลังโหลด…" : `${filtered.length} บริษัท`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!filtered?.length}>
            <Download className="mr-1.5 h-4 w-4" /> Export CSV
          </Button>
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
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="px-3 py-2.5 w-8"><Checkbox checked={!!filtered?.length && selected.size === filtered.length} onCheckedChange={(v) => v ? selectAll() : clearAll()} /></th>
                  <th className="px-4 py-2.5 text-left font-medium">ชื่อบริษัท</th>
                  <th className="px-4 py-2.5 text-left font-medium">อุตสาหกรรม</th>
                  <th className="px-4 py-2.5 text-left font-medium">เว็บไซต์</th>
                  <th className="px-4 py-2.5 text-left font-medium">โทรศัพท์</th>
                  <th className="px-4 py-2.5 text-center font-medium">ดีล</th>
                  <th className="px-4 py-2.5 text-left font-medium">สร้างเมื่อ</th>
                  <th className="px-2 py-2.5 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((a) => (
                  <tr key={a.id} className={`hover:bg-muted/30 transition-colors ${selected.has(a.id) ? "bg-primary/5" : ""}`}>
                    <td className="px-3 py-3"><Checkbox checked={selected.has(a.id)} onCheckedChange={() => toggleSelect(a.id)} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          to="/accounts/$accountId"
                          params={{ accountId: a.id }}
                          className="font-medium text-primary hover:underline"
                        >
                          {a.name}
                        </Link>
                        {a.is_key_account && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                            <Crown className="h-2.5 w-2.5" /> Key Account
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {a.industry ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {a.website ? (
                        <a
                          href={a.website.startsWith("http") ? a.website : `https://${a.website}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline truncate block max-w-[160px]"
                        >
                          {a.website}
                        </a>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {a.phone ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {(leadsCount.get(a.id) ?? 0) > 0 ? (
                        <Badge variant="secondary" className="text-[11px]">
                          {leadsCount.get(a.id)}
                        </Badge>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatThaiDate(a.created_at)}
                    </td>
                    <td className="px-2 py-3">
                      <RowActions actions={[
                        stdOpen(() => window.location.assign(`/accounts/${a.id}`)),
                        stdDupe(() => duplicateAccount(a)),
                        stdDelete(() => deleteAccount(a.id)),
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
    name: "", industry: "", website: "", phone: "", address: "",
  });

  useEffect(() => {
    if (open) setForm({ name: "", industry: "", website: "", phone: "", address: "" });
  }, [open]);

  const submit = async () => {
    if (!form.name.trim()) return toast.error("กรุณาระบุชื่อบริษัท");
    setSaving(true);
    const { error } = await crmDb().from("accounts").insert({
      name: form.name.trim(),
      industry: form.industry.trim() || null,
      website: form.website.trim() || null,
      phone: form.phone.trim() || null,
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
            <Label className="text-xs">อุตสาหกรรม</Label>
            <Input placeholder="เช่น อาหาร, IT, ก่อสร้าง" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
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
            <Label className="text-xs">ที่อยู่</Label>
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
