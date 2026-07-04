import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}

export function NewLeadDialog({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    account_id: "",
    new_account_name: "",
    expected_value: "",
    source: "",
    flowaccount_quotation_no: "",
  });

  useEffect(() => {
    if (!open) return;
    crmDb()
      .from("accounts")
      .select("id,name")
      .order("name")
      .then(({ data }: any) => setAccounts(data ?? []));
    setForm({ title: "", account_id: "", new_account_name: "", expected_value: "", source: "", flowaccount_quotation_no: "" });
  }, [open]);

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error("กรุณาระบุชื่อดีล");
      return;
    }
    setSaving(true);
    let account_id = form.account_id || null;
    if (!account_id && form.new_account_name.trim()) {
      const { data, error } = await crmDb()
        .from("accounts")
        .insert({ name: form.new_account_name.trim(), owner_id: user?.id, created_by: user?.id })
        .select("id")
        .single();
      if (error) {
        setSaving(false);
        toast.error("สร้างบริษัทไม่สำเร็จ", { description: error.message });
        return;
      }
      account_id = data.id;
    }

    const { error } = await crmDb()
      .from("leads")
      .insert({
        title: form.title.trim(),
        stage: "new",
        account_id,
        expected_value: form.expected_value ? Number(form.expected_value) : null,
        source: form.source || null,
        flowaccount_quotation_no: form.flowaccount_quotation_no || null,
        owner_id: user?.id,
        created_by: user?.id,
      });
    setSaving(false);
    if (error) {
      toast.error("สร้างดีลไม่สำเร็จ", { description: error.message });
      return;
    }
    toast.success("สร้างดีลใหม่แล้ว");
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>เพิ่มดีลใหม่</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>ชื่อดีล *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>

          <div className="space-y-2">
            <Label>บริษัท</Label>
            <Select value={form.account_id || "new"} onValueChange={(v) => setForm({ ...form, account_id: v === "new" ? "" : v })}>
              <SelectTrigger>
                <SelectValue placeholder="เลือกบริษัท" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">+ สร้างบริษัทใหม่</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!form.account_id && (
              <Input
                placeholder="ชื่อบริษัทใหม่"
                value={form.new_account_name}
                onChange={(e) => setForm({ ...form, new_account_name: e.target.value })}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>มูลค่าคาดหวัง</Label>
              <Input
                type="number"
                value={form.expected_value}
                onChange={(e) => setForm({ ...form, expected_value: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>ที่มา</Label>
              <Select value={form.source || "none"} onValueChange={(v) => setForm({ ...form, source: v === "none" ? "" : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="เลือก" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">ไม่ระบุ</SelectItem>
                  <SelectItem value="line_oa">LINE OA</SelectItem>
                  <SelectItem value="website">เว็บไซต์</SelectItem>
                  <SelectItem value="referral">แนะนำ</SelectItem>
                  <SelectItem value="other">อื่นๆ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>FlowAccount เลขที่ใบเสนอราคา</Label>
            <Input
              value={form.flowaccount_quotation_no}
              onChange={(e) => setForm({ ...form, flowaccount_quotation_no: e.target.value })}
              placeholder="ไม่บังคับ"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            สร้างดีล
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
