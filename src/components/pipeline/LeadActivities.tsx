import { useEffect, useState } from "react";
import { Phone, MessageCircle, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABEL,
  activityIcon,
  formatThaiDate,
  type Activity,
  type ActivityType,
} from "@/lib/activities";

export function LeadActivities({ leadId }: { leadId: string }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Activity[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ type: ActivityType; subject: string; due_at: string; body: string }>({
    type: "call",
    subject: "",
    due_at: "",
    body: "",
  });

  const load = async () => {
    const { data } = await crmDb()
      .from("activities")
      .select("*")
      .eq("lead_id", leadId)
      .order("due_at", { ascending: true, nullsFirst: false });
    setItems((data ?? []) as Activity[]);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [leadId]);

  const quickLog = async (type: "call" | "line") => {
    setSaving(true);
    const subject = type === "line" ? "ติดตามทาง Line" : "โทรติดตาม";
    const now = new Date().toISOString();
    const { error } = await crmDb().from("activities").insert({
      lead_id: leadId,
      type,
      subject,
      done: true,
      done_at: now,
      owner_id: user?.id,
    });
    setSaving(false);
    if (error) return toast.error("บันทึกไม่สำเร็จ", { description: error.message });
    toast.success("บันทึกกิจกรรมแล้ว");
    load();
  };

  const saveNew = async () => {
    if (!form.subject.trim()) return toast.error("กรุณาระบุหัวข้อ");
    setSaving(true);
    const { error } = await crmDb().from("activities").insert({
      lead_id: leadId,
      type: form.type,
      subject: form.subject.trim(),
      body: form.body.trim() || null,
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
      done: false,
      owner_id: user?.id,
    });
    setSaving(false);
    if (error) return toast.error("บันทึกไม่สำเร็จ", { description: error.message });
    toast.success("เพิ่มกิจกรรมแล้ว");
    setAdding(false);
    setForm({ type: "call", subject: "", due_at: "", body: "" });
    load();
  };

  const toggleDone = async (a: Activity, done: boolean) => {
    const { error } = await crmDb()
      .from("activities")
      .update({ done, done_at: done ? new Date().toISOString() : null })
      .eq("id", a.id);
    if (error) return toast.error("อัปเดตไม่สำเร็จ", { description: error.message });
    load();
  };

  return (
    <div className="space-y-3 border-t pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">กิจกรรม</div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => quickLog("call")} disabled={saving}>
            <Phone className="mr-1 h-4 w-4" /> โทรหา
          </Button>
          <Button size="sm" variant="outline" onClick={() => quickLog("line")} disabled={saving}>
            <MessageCircle className="mr-1 h-4 w-4" /> ส่ง Line
          </Button>
          <Button size="sm" variant={adding ? "default" : "outline"} onClick={() => setAdding((v) => !v)}>
            <Plus className="mr-1 h-4 w-4" /> เพิ่มกิจกรรม
          </Button>
        </div>
      </div>

      {adding && (
        <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">ประเภท</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as ActivityType })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{ACTIVITY_TYPE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">กำหนดเวลา</Label>
              <Input
                type="datetime-local"
                className="h-9"
                value={form.due_at}
                onChange={(e) => setForm({ ...form, due_at: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">หัวข้อ</Label>
            <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="เช่น โทรติดตามใบเสนอราคา" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">โน้ต (ไม่บังคับ)</Label>
            <Textarea rows={2} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>ยกเลิก</Button>
            <Button size="sm" onClick={saveNew} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} บันทึก
            </Button>
          </div>
        </div>
      )}

      <ul className="space-y-2">
        {items === null && <li className="text-xs text-muted-foreground">กำลังโหลด…</li>}
        {items && items.length === 0 && (
          <li className="rounded-md border border-dashed py-4 text-center text-xs text-muted-foreground">
            ยังไม่มีกิจกรรม
          </li>
        )}
        {items?.map((a) => {
          const Icon = activityIcon(a.type);
          const overdue = !a.done && !!a.due_at && new Date(a.due_at).getTime() < Date.now();
          return (
            <li
              key={a.id}
              className={`flex items-start gap-3 rounded-md border bg-background/60 px-3 py-2 ${
                overdue ? "border-l-4 border-l-red-500" : ""
              } ${a.done ? "opacity-60" : ""}`}
            >
              <Checkbox checked={a.done} onCheckedChange={(v) => toggleDone(a, !!v)} className="mt-1" />
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-medium ${a.done ? "line-through" : ""}`}>
                  {a.subject ?? ACTIVITY_TYPE_LABEL[a.type as ActivityType] ?? a.type}
                </div>
                {a.body && <div className="text-xs text-muted-foreground">{a.body}</div>}
                <div className={`text-[11px] ${overdue ? "font-medium text-red-600" : "text-muted-foreground"}`}>
                  {a.due_at ? formatThaiDate(a.due_at) : a.done_at ? `เสร็จ ${formatThaiDate(a.done_at)}` : "ไม่มีกำหนด"}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
