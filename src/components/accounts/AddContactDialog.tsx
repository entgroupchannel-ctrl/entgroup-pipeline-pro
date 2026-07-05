/**
 * AddContactDialog — เพิ่ม/แก้ไขผู้ติดต่อโดยไม่ออกจากหน้าปัจจุบัน
 * ใช้ได้ทั้งจาก Key Accounts และหน้าอื่นๆ
 */
import { useState } from "react";
import { Loader2, Trash2, Cake } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";

interface ContactData {
  id?: string;
  name: string;
  nickname?: string | null;
  position?: string | null;
  email?: string | null;
  phone?: string | null;
  line_id?: string | null;
  birth_date?: string | null;
  birth_year?: number | null;
  gender?: string | null;
  personal_notes?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accountId: string;
  accountName: string;
  initial?: ContactData | null;  // null = add mode
  onSaved: () => void;
}

function daysUntilNextOccurrence(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date(); now.setHours(0,0,0,0);
  const thisYear = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  const next = thisYear >= now ? thisYear : new Date(now.getFullYear()+1, d.getMonth(), d.getDate());
  return Math.round((next.getTime() - now.getTime()) / 86400000);
}

export function AddContactDialog({ open, onOpenChange, accountId, accountName, initial, onSaved }: Props) {
  const { user } = useAuth();
  const isEdit = !!initial?.id;
  const currentYear = new Date().getFullYear();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name:           initial?.name           ?? "",
    nickname:       initial?.nickname        ?? "",
    position:       initial?.position        ?? "",
    email:          initial?.email           ?? "",
    phone:          initial?.phone           ?? "",
    line_id:        initial?.line_id         ?? "",
    birth_date:     initial?.birth_date      ?? "",
    birth_year:     initial?.birth_year != null ? String(initial.birth_year) : "",
    gender:         initial?.gender          ?? "",
    personal_notes: initial?.personal_notes  ?? "",
  });

  const set = (patch: Partial<typeof form>) => setForm(prev => ({ ...prev, ...patch }));

  const submit = async () => {
    if (!form.name.trim()) { toast.error("กรุณาระบุชื่อผู้ติดต่อ"); return; }
    setSaving(true);
    const payload = {
      account_id:     accountId,
      name:           form.name.trim(),
      nickname:       form.nickname.trim()       || null,
      position:       form.position.trim()       || null,
      email:          form.email.trim()          || null,
      phone:          form.phone.trim()          || null,
      line_id:        form.line_id.trim()        || null,
      birth_date:     form.birth_date            || null,
      birth_year:     form.birth_year ? Number(form.birth_year) : null,
      gender:         form.gender                || null,
      personal_notes: form.personal_notes.trim() || null,
    };

    let error;
    if (isEdit && initial?.id) {
      ({ error } = await crmDb().from("contacts").update(payload).eq("id", initial.id));
    } else {
      ({ error } = await crmDb().from("contacts").insert({ ...payload, created_by: user?.id }));
    }
    setSaving(false);
    if (error) { toast.error("บันทึกไม่สำเร็จ", { description: error.message }); return; }
    toast.success(isEdit ? "แก้ไขผู้ติดต่อแล้ว" : `เพิ่ม "${form.name}" เข้า ${accountName} แล้ว`);
    onSaved();
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!initial?.id) return;
    if (!confirm(`ลบ "${initial.name}" ออกจากระบบ?`)) return;
    const { error } = await crmDb().from("contacts").delete().eq("id", initial.id);
    if (error) { toast.error("ลบไม่สำเร็จ"); return; }
    toast.success("ลบผู้ติดต่อแล้ว");
    onSaved();
    onOpenChange(false);
  };

  const bdays = daysUntilNextOccurrence(form.birth_date);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? "แก้ไขผู้ติดต่อ" : "เพิ่มผู้ติดต่อ"}
            <span className="text-sm font-normal text-muted-foreground">— {accountName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Row 1: ชื่อ + ชื่อเล่น + ตำแหน่ง */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">ชื่อ-นามสกุล <span className="text-red-500">*</span></Label>
              <Input autoFocus placeholder="ชื่อเต็ม" value={form.name} onChange={(e) => set({ name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && submit()} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ชื่อเล่น</Label>
              <Input placeholder="ต้น, Joy" value={form.nickname} onChange={(e) => set({ nickname: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ตำแหน่ง</Label>
              <Input placeholder="CEO, ผจก.ฝ่ายจัดซื้อ" value={form.position} onChange={(e) => set({ position: e.target.value })} />
            </div>
          </div>

          {/* Row 2: โทร + Line + อีเมล */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">โทรศัพท์</Label>
              <Input placeholder="08x-xxx-xxxx" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Line ID</Label>
              <Input placeholder="@line_id" value={form.line_id} onChange={(e) => set({ line_id: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">อีเมล</Label>
              <Input type="email" placeholder="email@..." value={form.email} onChange={(e) => set({ email: e.target.value })} />
            </div>
          </div>

          {/* Row 3: วันเกิด + ปีเกิด + เพศ */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1"><Cake className="h-3 w-3" /> วันเกิด</Label>
              <Input type="date" value={form.birth_date} onChange={(e) => set({ birth_date: e.target.value })} />
              {bdays !== null && (
                <p className="text-[11px] text-muted-foreground">
                  {bdays === 0 ? "🎂 วันนี้!" : bdays === 1 ? "🎂 พรุ่งนี้" : `อีก ${bdays} วัน`}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ปีเกิด ค.ศ.</Label>
              <Input type="number" placeholder={String(currentYear - 35)} min={1920} max={currentYear}
                value={form.birth_year} onChange={(e) => set({ birth_year: e.target.value })} />
              {form.birth_year && <p className="text-[11px] text-muted-foreground">อายุ ~{currentYear - Number(form.birth_year)} ปี</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">เพศ</Label>
              <Select value={form.gender || "none"} onValueChange={(v) => set({ gender: v === "none" ? "" : v })}>
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

          {/* Row 4: บันทึกส่วนตัว */}
          <div className="space-y-1">
            <Label className="text-xs">บันทึกส่วนตัว (ครอบครัว, งานอดิเรก, ความสนใจ)</Label>
            <Textarea rows={2} className="resize-none text-sm"
              placeholder="เช่น ชอบกอล์ฟ, ดื่มกาแฟ Americano, ไม่รับสายช่วงบ่าย"
              value={form.personal_notes}
              onChange={(e) => set({ personal_notes: e.target.value })} />
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 mt-2">
          <div>
            {isEdit && (
              <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={handleDelete}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> ลบ
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {isEdit ? "บันทึกการแก้ไข" : "เพิ่มผู้ติดต่อ"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
