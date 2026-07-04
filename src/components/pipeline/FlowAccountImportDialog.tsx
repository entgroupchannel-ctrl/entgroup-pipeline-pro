import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileDown } from "lucide-react";
import { toast } from "sonner";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}

export function FlowAccountImportDialog({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; full_name: string | null }[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    quotation_no: "",
    account_id: "",
    new_account_name: "",
    contact_name: "",
    contact_phone: "",
    contact_line: "",
    expected_value: "",
    owner_id: "",
  });

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [a, u] = await Promise.all([
        crmDb().from("accounts").select("id,name").order("name"),
        crmDb().from("user_profiles").select("id,full_name,role,is_active").eq("is_active", true),
      ]);
      setAccounts(a.data ?? []);
      setUsers((u.data ?? []).filter((p: any) => p.role === "sales" || p.role === "manager" || p.role === "admin"));
      setForm((f) => ({ ...f, owner_id: user?.id ?? "" }));
    })();
  }, [open, user?.id]);

  const submit = async () => {
    if (!form.quotation_no.trim()) return toast.error("กรอกเลขที่ใบเสนอราคา");
    if (!form.account_id && !form.new_account_name.trim()) return toast.error("เลือกหรือกรอกบริษัท");
    setSaving(true);

    let accountId = form.account_id;
    if (!accountId) {
      const { data, error } = await crmDb()
        .from("accounts")
        .insert({ name: form.new_account_name.trim(), source: "line_oa", owner_id: user?.id, created_by: user?.id })
        .select("id")
        .single();
      if (error || !data) { setSaving(false); return toast.error("สร้างบริษัทไม่สำเร็จ", { description: error?.message }); }
      accountId = data.id;
    }

    let contactId: string | null = null;
    if (form.contact_name.trim()) {
      const { data, error } = await crmDb()
        .from("contacts")
        .insert({
          account_id: accountId,
          name: form.contact_name.trim(),
          phone: form.contact_phone || null,
          line_id: form.contact_line || null,
          is_primary: true,
        })
        .select("id")
        .single();
      if (error) { setSaving(false); return toast.error("สร้างผู้ติดต่อไม่สำเร็จ", { description: error.message }); }
      contactId = data?.id ?? null;
    }

    const { error: leadErr } = await crmDb().from("leads").insert({
      title: `QT ${form.quotation_no}`,
      account_id: accountId,
      contact_id: contactId,
      stage: "new",
      source: "line_oa",
      expected_value: form.expected_value ? Number(form.expected_value) : null,
      flowaccount_quotation_no: form.quotation_no.trim(),
      owner_id: form.owner_id || user?.id,
      created_by: user?.id,
    });

    setSaving(false);
    if (leadErr) return toast.error("สร้างดีลไม่สำเร็จ", { description: leadErr.message });

    toast.success("นำเข้าจาก FlowAccount แล้ว");
    setForm({ quotation_no: "", account_id: "", new_account_name: "", contact_name: "", contact_phone: "", contact_line: "", expected_value: "", owner_id: user?.id ?? "" });
    onCreated();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-primary" />
            นำเข้าจาก FlowAccount
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>เลขที่ใบเสนอราคา *</Label>
            <Input value={form.quotation_no} onChange={(e) => setForm({ ...form, quotation_no: e.target.value })} placeholder="QT-2025-0042" />
          </div>

          <div className="space-y-2">
            <Label>บริษัท *</Label>
            <Select value={form.account_id || "new"} onValueChange={(v) => setForm({ ...form, account_id: v === "new" ? "" : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">+ สร้างบริษัทใหม่</SelectItem>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {!form.account_id && (
              <Input value={form.new_account_name} onChange={(e) => setForm({ ...form, new_account_name: e.target.value })} placeholder="ชื่อบริษัทใหม่" />
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-1">
              <Label>ผู้ติดต่อ</Label>
              <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>โทร</Label>
              <Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Line ID</Label>
              <Input value={form.contact_line} onChange={(e) => setForm({ ...form, contact_line: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>มูลค่าคาดหวัง (บาท)</Label>
              <Input type="number" value={form.expected_value} onChange={(e) => setForm({ ...form, expected_value: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>มอบหมายให้</Label>
              <Select value={form.owner_id} onValueChange={(v) => setForm({ ...form, owner_id: v })}>
                <SelectTrigger><SelectValue placeholder="เลือก" /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.id.slice(0, 8)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Source: <span className="font-medium">line_oa</span> · Stage: <span className="font-medium">ใหม่</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            นำเข้า
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
