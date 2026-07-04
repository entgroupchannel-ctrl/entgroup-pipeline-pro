import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, FileText } from "lucide-react";
import { toast } from "sonner";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";
import { formatBaht, formatThaiDate } from "@/lib/format";
import { fetchFADocuments, type FADocument } from "@/lib/flowaccount-client";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImported: () => void;
}

type Filter = "all" | "quotation" | "billing_note";

export function FAImportModal({ open, onOpenChange, onImported }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<FADocument[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; full_name: string | null; email?: string | null; role?: string }[]>([]);
  const [selected, setSelected] = useState<FADocument | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: "",
    account_id: "",
    new_account_name: "",
    expected_value: "",
    flowaccount_quotation_no: "",
    source: "line_oa",
    owner_id: "",
    stage: "new",
  });

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setLoading(true);
    (async () => {
      try {
        const [docsData, a, u] = await Promise.all([
          fetchFADocuments(),
          crmDb().from("accounts").select("id,name").order("name"),
          crmDb().from("user_profiles").select("id,full_name,role,email,is_active").eq("is_active", true),
        ]);
        setDocs(docsData);
        setAccounts(a.data ?? []);
        setProfiles(
          (u.data ?? []).filter(
            (p: any) => p.role === "sales" || p.role === "manager" || p.role === "admin",
          ),
        );
      } catch (e: any) {
        toast.error("โหลดเอกสารไม่สำเร็จ", { description: e.message });
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return docs.filter((d) => {
      if (filter !== "all" && d.document_type !== filter) return false;
      if (!needle) return true;
      return (
        (d.document_serial ?? "").toLowerCase().includes(needle) ||
        (d.contact_name ?? "").toLowerCase().includes(needle)
      );
    });
  }, [docs, q, filter]);

  const selectDoc = (d: FADocument) => {
    setSelected(d);
    // Try matching account by contact_name
    const matchedAccount = accounts.find(
      (a) => a.name.trim().toLowerCase() === (d.contact_name ?? "").trim().toLowerCase(),
    );
    // Try matching sales by email
    const matchedOwner = d.sales_email
      ? profiles.find((p) => (p.email ?? "").toLowerCase() === d.sales_email!.toLowerCase())
      : null;
    setForm({
      title: `${d.contact_name ?? "ลูกค้า"} — ${d.document_serial}`,
      account_id: matchedAccount?.id ?? "",
      new_account_name: matchedAccount ? "" : d.contact_name ?? "",
      expected_value: d.grand_total != null ? String(d.grand_total) : "",
      flowaccount_quotation_no: d.document_serial,
      source: "line_oa",
      owner_id: matchedOwner?.id ?? user?.id ?? "",
      stage: "new",
    });
  };

  const submit = async () => {
    if (!selected) return;
    if (!form.account_id && !form.new_account_name.trim()) {
      toast.error("เลือกหรือกรอกบริษัท");
      return;
    }
    setSaving(true);
    try {
      let accountId = form.account_id;
      if (!accountId && form.new_account_name.trim()) {
        const { data: acc, error: accErr } = await crmDb()
          .from("accounts")
          .insert({ name: form.new_account_name.trim(), owner_id: form.owner_id || user?.id, created_by: user?.id })
          .select("id")
          .single();
        if (accErr) throw new Error(accErr.message);
        accountId = acc.id;
      }
      const { error } = await crmDb().from("leads").insert({
        title: form.title,
        account_id: accountId,
        stage: form.stage,
        expected_value: form.expected_value ? Number(form.expected_value) : null,
        flowaccount_quotation_no: form.flowaccount_quotation_no || null,
        source: form.source || null,
        owner_id: form.owner_id || user?.id,
        created_by: user?.id,
        fa_inbound_id: selected.id,
      });
      if (error) throw new Error(error.message);
      toast.success(`สร้าง Lead จาก ${selected.document_serial} แล้ว`);
      onImported();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("สร้าง Lead ไม่สำเร็จ", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Import จาก FlowAccount</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          {/* LEFT: document list */}
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="ค้นหา document_serial หรือ contact_name"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="flex gap-1">
              {(["all", "quotation", "billing_note"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    filter === f
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  {f === "all" ? "ทั้งหมด" : f === "quotation" ? "Quotation (QT)" : "Billing Note (BN)"}
                </button>
              ))}
            </div>

            <div className="max-h-[400px] overflow-y-auto rounded-lg border">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">ไม่พบเอกสาร</div>
              ) : (
                <ul className="divide-y">
                  {filtered.map((d) => {
                    const used = !!d.created_rfq_id;
                    const isQT = d.document_type === "quotation";
                    const isSelected = selected?.id === d.id;
                    return (
                      <li key={d.id}>
                        <button
                          type="button"
                          onClick={() => {
                            if (used) {
                              toast.warning("เอกสารนี้ถูกใช้แล้วในระบบ", { description: "จะสร้าง Lead ใหม่ซ้ำ" });
                            }
                            selectDoc(d);
                          }}
                          className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted/50 ${
                            isSelected ? "bg-primary/5" : ""
                          } ${used ? "opacity-60" : ""}`}
                        >
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              isQT
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                                : "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                            }`}
                          >
                            {isQT ? "QT" : "BN"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-mono text-xs font-semibold">{d.document_serial}</span>
                              {used && <Badge variant="outline" className="h-4 text-[9px]">ใช้แล้ว</Badge>}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">{d.contact_name ?? "-"}</div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-xs font-medium">{formatBaht(Number(d.grand_total ?? 0))}</div>
                            <div className="text-[10px] text-muted-foreground">{formatThaiDate(d.published_on)}</div>
                          </div>
                          {d.status_string && (
                            <Badge variant="secondary" className="ml-1 h-5 shrink-0 text-[10px]">
                              {d.status_string}
                            </Badge>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* RIGHT: pre-filled form */}
          <div className="rounded-lg border bg-muted/20 p-4">
            {!selected ? (
              <div className="flex h-full min-h-[300px] items-center justify-center text-center text-sm text-muted-foreground">
                <div>
                  <FileText className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  เลือกเอกสารจากด้านซ้ายเพื่อสร้าง Lead
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-mono text-sm font-semibold">{selected.document_serial}</div>
                  <Badge variant="outline">{selected.document_type === "quotation" ? "QT" : "BN"}</Badge>
                </div>
                <div>
                  <Label className="text-xs">ชื่อดีล</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">บริษัท</Label>
                  <Select
                    value={form.account_id || "new"}
                    onValueChange={(v) => setForm({ ...form, account_id: v === "new" ? "" : v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">— สร้างบริษัทใหม่ —</SelectItem>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!form.account_id && (
                    <Input
                      className="mt-2"
                      placeholder="ชื่อบริษัทใหม่"
                      value={form.new_account_name}
                      onChange={(e) => setForm({ ...form, new_account_name: e.target.value })}
                    />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">มูลค่าคาดหวัง</Label>
                    <Input
                      type="number"
                      value={form.expected_value}
                      onChange={(e) => setForm({ ...form, expected_value: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">QT No.</Label>
                    <Input
                      value={form.flowaccount_quotation_no}
                      onChange={(e) => setForm({ ...form, flowaccount_quotation_no: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">ที่มา</Label>
                    <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="line_oa">LINE OA</SelectItem>
                        <SelectItem value="website">เว็บไซต์</SelectItem>
                        <SelectItem value="referral">แนะนำ</SelectItem>
                        <SelectItem value="other">อื่นๆ</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">มอบหมาย</Label>
                    <Select
                      value={form.owner_id || "none"}
                      onValueChange={(v) => setForm({ ...form, owner_id: v === "none" ? "" : v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">ไม่ระบุ</SelectItem>
                        {profiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.id.slice(0, 8)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" onClick={() => setSelected(null)}>ยกเลิก</Button>
                  <Button onClick={submit} disabled={saving}>
                    {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                    สร้าง Lead
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
