import { useEffect, useState } from "react";
import { Phone, MessageCircle, Mail, StickyNote, CheckCircle2, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { th } from "date-fns/locale";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";

interface Activity {
  id: string;
  type: string;
  subject: string | null;
  body: string | null;
  done: boolean;
  done_at: string | null;
  due_at: string | null;
  created_at: string;
}

export function LeadActivities({ leadId }: { leadId: string }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Activity[] | null>(null);
  const [mode, setMode] = useState<"line" | "call" | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await crmDb()
      .from("activities")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });
    setItems((data ?? []) as Activity[]);
  };

  useEffect(() => { load(); }, [leadId]);

  const quickLog = async (type: "line" | "call") => {
    setSaving(true);
    const subject = type === "line" ? "ติดตามทาง Line" : "โทรติดตาม";
    const { error } = await crmDb().from("activities").insert({
      lead_id: leadId,
      type,
      subject,
      body: note || null,
      done: true,
      done_at: new Date().toISOString(),
      owner_id: user?.id,
    });
    setSaving(false);
    if (error) return toast.error("บันทึกไม่สำเร็จ", { description: error.message });
    toast.success("บันทึกกิจกรรมแล้ว");
    setNote("");
    setMode(null);
    load();
  };

  return (
    <div className="space-y-3 border-t pt-5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">กิจกรรม</div>
        <div className="flex gap-2">
          <Button size="sm" variant={mode === "line" ? "default" : "outline"} onClick={() => setMode(mode === "line" ? null : "line")}>
            <MessageCircle className="mr-1 h-4 w-4" /> ส่ง Line
          </Button>
          <Button size="sm" variant={mode === "call" ? "default" : "outline"} onClick={() => setMode(mode === "call" ? null : "call")}>
            <Phone className="mr-1 h-4 w-4" /> โทรหา
          </Button>
        </div>
      </div>

      {mode && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <Textarea rows={2} placeholder="โน้ต (ไม่บังคับ)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setMode(null); setNote(""); }}>ยกเลิก</Button>
            <Button size="sm" onClick={() => quickLog(mode)} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              บันทึก
            </Button>
          </div>
        </div>
      )}

      <ul className="space-y-2">
        {items === null && (
          <li className="text-xs text-muted-foreground">กำลังโหลด…</li>
        )}
        {items && items.length === 0 && (
          <li className="rounded-md border border-dashed py-4 text-center text-xs text-muted-foreground">
            ยังไม่มีกิจกรรม
          </li>
        )}
        {items?.map((a) => (
          <li key={a.id} className="flex items-start gap-3 rounded-md border bg-background/60 px-3 py-2">
            <ActivityIcon type={a.type} done={a.done} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{a.subject ?? a.type}</div>
              {a.body && <div className="text-xs text-muted-foreground">{a.body}</div>}
              <div className="text-[11px] text-muted-foreground">
                {formatDistanceToNow(new Date(a.done_at ?? a.created_at), { addSuffix: true, locale: th })}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActivityIcon({ type, done }: { type: string; done: boolean }) {
  const Icon = type === "call" ? Phone : type === "email" ? Mail : type === "line" ? MessageCircle : type === "note" ? StickyNote : CheckCircle2;
  return (
    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${done ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
      <Icon className="h-4 w-4" />
    </span>
  );
}
