/**
 * ActivityLogDialog — structured activity log form
 * Stores rich data as JSON in activities.body, auto-generates subject
 * No DB migration needed — works with existing schema
 */
import { useEffect, useState } from "react";
import { Loader2, Phone, Mail, Users, FileText, MessageCircle, ThumbsUp, ThumbsDown, Minus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ActivityKind = "call" | "meeting" | "line" | "email" | "note";

interface BaseLog {
  kind: ActivityKind;
  date: string;        // YYYY-MM-DD
  time: string;        // HH:MM
  duration_min: string;
  topic: string;       // เรื่องที่คุย / หัวข้อ
  issues: string;      // ประเด็นสำคัญ
  next_action: string; // ขั้นตอนต่อไป
  next_date: string;   // วันนัดครั้งต่อไป
  sentiment: number;   // 1–5 ความรู้สึก/ท่าที
  result: "positive" | "neutral" | "negative";
  notes: string;       // รายละเอียดอื่น ๆ
}

// Extra fields per kind
interface CallLog extends BaseLog {
  kind: "call";
  answered: "yes" | "no" | "voicemail";
  call_number: string;
}
interface MeetingLog extends BaseLog {
  kind: "meeting";
  location: string;
  attendees: string;
  decision: string;
}
interface LineLog extends BaseLog {
  kind: "line";
  message_type: "text" | "image" | "document" | "voice";
  read_status: "read" | "unread" | "replied";
}
interface EmailLog extends BaseLog {
  kind: "email";
  subject_line: string;
  opened: "yes" | "no" | "unknown";
  replied: "yes" | "no";
}
interface NoteLog extends BaseLog {
  kind: "note";
  note_category: "internal" | "reminder" | "risk" | "opportunity";
}

type AnyLog = CallLog | MeetingLog | LineLog | EmailLog | NoteLog;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const KIND_LABELS: Record<ActivityKind, string> = {
  call: "โทรศัพท์",
  meeting: "เข้าพบ / ประชุม",
  line: "ข้อความ LINE",
  email: "อีเมล",
  note: "บันทึก / โน้ต",
};

const KIND_ICONS: Record<ActivityKind, React.ElementType> = {
  call: Phone,
  meeting: Users,
  line: MessageCircle,
  email: Mail,
  note: FileText,
};

function nowDate() {
  return new Date().toISOString().slice(0, 10);
}
function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}

function buildSubject(log: AnyLog): string {
  const label = KIND_LABELS[log.kind];
  const topic = log.topic.trim();
  if (topic) return `${label}: ${topic}`;
  return label;
}

function sentimentLabel(v: number): string {
  if (v <= 1) return "เย็นชา / ไม่สนใจ";
  if (v <= 2) return "ระมัดระวัง / ลังเล";
  if (v === 3) return "เป็นกลาง";
  if (v === 4) return "เป็นมิตร / สนใจ";
  return "กระตือรือร้น / พร้อมซื้อ";
}

function sentimentColor(v: number): string {
  if (v <= 1) return "#E24B4A";
  if (v <= 2) return "#BA7517";
  if (v === 3) return "#888780";
  if (v === 4) return "#185FA5";
  return "#3B6D11";
}

// ─── Default state factory ────────────────────────────────────────────────────

function defaultLog(kind: ActivityKind): AnyLog {
  const base: BaseLog = {
    kind,
    date: nowDate(),
    time: nowTime(),
    duration_min: "",
    topic: "",
    issues: "",
    next_action: "",
    next_date: "",
    sentiment: 3,
    result: "neutral",
    notes: "",
  };
  if (kind === "call") return { ...base, kind: "call", answered: "yes", call_number: "" };
  if (kind === "meeting") return { ...base, kind: "meeting", location: "", attendees: "", decision: "" };
  if (kind === "line") return { ...base, kind: "line", message_type: "text", read_status: "read" };
  if (kind === "email") return { ...base, kind: "email", subject_line: "", opened: "unknown", replied: "no" };
  return { ...base, kind: "note", note_category: "internal" };
}

// ─── Shared field sections ───────────────────────────────────────────────────

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <Label style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</Label>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: "0.06em",
      color: "var(--text-muted)",
      textTransform: "uppercase",
      borderBottom: "0.5px solid var(--border)",
      paddingBottom: 4,
      marginTop: 4,
    }}>
      {children}
    </div>
  );
}

// ─── Kind-specific extra fields ───────────────────────────────────────────────

function CallFields({ log, set }: { log: CallLog; set: (p: Partial<CallLog>) => void }) {
  return (
    <Row>
      <Field label="หมายเลขที่โทร">
        <Input value={log.call_number} onChange={e => set({ call_number: e.target.value })} placeholder="0xx-xxx-xxxx" />
      </Field>
      <Field label="สถานะการรับสาย">
        <Select value={log.answered} onValueChange={v => set({ answered: v as CallLog["answered"] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="yes">รับสาย ✅</SelectItem>
            <SelectItem value="no">ไม่รับสาย ❌</SelectItem>
            <SelectItem value="voicemail">ฝากข้อความ 📱</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </Row>
  );
}

function MeetingFields({ log, set }: { log: MeetingLog; set: (p: Partial<MeetingLog>) => void }) {
  return (
    <>
      <Row>
        <Field label="สถานที่ / รูปแบบ">
          <Input value={log.location} onChange={e => set({ location: e.target.value })} placeholder="เช่น สำนักงานลูกค้า, Google Meet" />
        </Field>
        <Field label="ผู้เข้าร่วม">
          <Input value={log.attendees} onChange={e => set({ attendees: e.target.value })} placeholder="เช่น ผอ.สมชาย, คุณสมหญิง" />
        </Field>
      </Row>
      <Field label="ผลการตัดสินใจ / มติที่ประชุม">
        <Textarea
          rows={2}
          value={log.decision}
          onChange={e => set({ decision: e.target.value })}
          placeholder="เช่น ลูกค้าตกลงรับใบเสนอราคา, ให้ส่งข้อมูลเพิ่มเติม..."
        />
      </Field>
    </>
  );
}

function LineFields({ log, set }: { log: LineLog; set: (p: Partial<LineLog>) => void }) {
  return (
    <Row>
      <Field label="ประเภทข้อความ">
        <Select value={log.message_type} onValueChange={v => set({ message_type: v as LineLog["message_type"] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="text">ข้อความ</SelectItem>
            <SelectItem value="image">รูปภาพ</SelectItem>
            <SelectItem value="document">เอกสาร</SelectItem>
            <SelectItem value="voice">เสียง</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="สถานะการอ่าน">
        <Select value={log.read_status} onValueChange={v => set({ read_status: v as LineLog["read_status"] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="read">อ่านแล้ว / ตอบแล้ว ✅</SelectItem>
            <SelectItem value="replied">ลูกค้าตอบกลับ 💬</SelectItem>
            <SelectItem value="unread">ยังไม่ได้อ่าน ⏳</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </Row>
  );
}

function EmailFields({ log, set }: { log: EmailLog; set: (p: Partial<EmailLog>) => void }) {
  return (
    <>
      <Field label="Subject อีเมล">
        <Input value={log.subject_line} onChange={e => set({ subject_line: e.target.value })} placeholder="หัวข้ออีเมลที่ส่ง" />
      </Field>
      <Row>
        <Field label="สถานะการเปิดอ่าน">
          <Select value={log.opened} onValueChange={v => set({ opened: v as EmailLog["opened"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">เปิดอ่านแล้ว ✅</SelectItem>
              <SelectItem value="no">ยังไม่เปิด ❌</SelectItem>
              <SelectItem value="unknown">ไม่ทราบ</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="มีการตอบกลับ">
          <Select value={log.replied} onValueChange={v => set({ replied: v as EmailLog["replied"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">ตอบกลับแล้ว ✅</SelectItem>
              <SelectItem value="no">ยังไม่ตอบ ❌</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </Row>
    </>
  );
}

function NoteFields({ log, set }: { log: NoteLog; set: (p: Partial<NoteLog>) => void }) {
  return (
    <Field label="หมวดหมู่บันทึก">
      <Select value={log.note_category} onValueChange={v => set({ note_category: v as NoteLog["note_category"] })}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="internal">📌 บันทึกภายใน</SelectItem>
          <SelectItem value="reminder">⏰ แจ้งเตือน / Reminder</SelectItem>
          <SelectItem value="risk">⚠️ ความเสี่ยง</SelectItem>
          <SelectItem value="opportunity">🎯 โอกาส</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  );
}

// ─── Result buttons ───────────────────────────────────────────────────────────

const RESULTS: { value: BaseLog["result"]; label: string; icon: React.ElementType; color: string }[] = [
  { value: "positive", label: "เป็นบวก", icon: ThumbsUp, color: "#3B6D11" },
  { value: "neutral",  label: "เป็นกลาง", icon: Minus,   color: "#888780" },
  { value: "negative", label: "เป็นลบ",  icon: ThumbsDown, color: "#E24B4A" },
];

function ResultPicker({ value, onChange }: { value: BaseLog["result"]; onChange: (v: BaseLog["result"]) => void }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {RESULTS.map(({ value: v, label, icon: Icon, color }) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "7px 10px",
            borderRadius: "var(--radius)",
            border: `1px solid ${value === v ? color : "var(--border)"}`,
            background: value === v ? `${color}18` : "transparent",
            color: value === v ? color : "var(--text-muted)",
            fontSize: 12,
            cursor: "pointer",
            fontWeight: value === v ? 600 : 400,
            transition: "all 0.15s",
          }}
        >
          <Icon size={14} />
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Main Dialog ──────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** If provided, saves to this lead. If null, caller handles save. */
  leadId?: string | null;
  /** Pre-select activity kind */
  defaultKind?: ActivityKind;
  /** Override title */
  title?: string;
  /** Called after successful save (when leadId is given) */
  onSaved?: () => void;
}

export function ActivityLogDialog({
  open,
  onOpenChange,
  leadId,
  defaultKind = "call",
  title,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const [log, setLog] = useState<AnyLog>(defaultLog(defaultKind));
  const [saving, setSaving] = useState(false);

  // Reset when opened with new kind
  useEffect(() => {
    if (open) setLog(defaultLog(defaultKind));
  }, [open, defaultKind]);

  function patch<T extends AnyLog>(partial: Partial<T>) {
    setLog((prev) => ({ ...prev, ...partial } as AnyLog));
  }

  const handleSave = async () => {
    if (!log.topic.trim() && log.kind !== "note") {
      toast.error("กรุณาระบุเรื่องที่คุย / หัวข้อ");
      return;
    }

    const subject = buildSubject(log);
    const doneAt = `${log.date}T${log.time || "00:00"}:00`;

    // Serialize structured data to JSON body
    const body = JSON.stringify(log);

    // Save regardless of whether leadId is provided
    // When leadId is null, activity is saved as a global (non-deal) activity
    setSaving(true);
    const { error } = await crmDb().from("activities").insert({
      lead_id: leadId ?? null,
      type: log.kind,
      subject,
      body,
      done: true,
      done_at: doneAt,
      due_at: log.next_date ? new Date(log.next_date).toISOString() : null,
      owner_id: user?.id,
    });
    setSaving(false);
    if (error) {
      toast.error("บันทึกไม่สำเร็จ: " + error.message);
      return;
    }
    toast.success("บันทึกกิจกรรมแล้ว ✅");
    onSaved?.();
    onOpenChange(false);
  };

  const KindIcon = KIND_ICONS[log.kind];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }}>
        <DialogHeader>
          <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <KindIcon size={18} />
            {title ?? `บันทึก${KIND_LABELS[log.kind]}`}
          </DialogTitle>
        </DialogHeader>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 4 }}>

          {/* ── ประเภท + วันเวลา ── */}
          <SectionTitle>ข้อมูลพื้นฐาน</SectionTitle>

          <Row>
            <Field label="ประเภทกิจกรรม">
              <Select
                value={log.kind}
                onValueChange={(v) => setLog(defaultLog(v as ActivityKind))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABELS) as ActivityKind[]).map((k) => {
                    const Ic = KIND_ICONS[k];
                    return (
                      <SelectItem key={k} value={k}>
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Ic size={13} />
                          {KIND_LABELS[k]}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </Field>
            <Field label="ระยะเวลา (นาที)">
              <Input
                type="number"
                min={0}
                placeholder="เช่น 30"
                value={log.duration_min}
                onChange={e => patch({ duration_min: e.target.value })}
              />
            </Field>
          </Row>

          <Row>
            <Field label="วันที่">
              <Input type="date" value={log.date} onChange={e => patch({ date: e.target.value })} />
            </Field>
            <Field label="เวลา">
              <Input type="time" value={log.time} onChange={e => patch({ time: e.target.value })} />
            </Field>
          </Row>

          {/* ── Kind-specific fields ── */}
          {log.kind === "call" && <CallFields log={log as CallLog} set={p => patch<CallLog>(p)} />}
          {log.kind === "meeting" && <MeetingFields log={log as MeetingLog} set={p => patch<MeetingLog>(p)} />}
          {log.kind === "line" && <LineFields log={log as LineLog} set={p => patch<LineLog>(p)} />}
          {log.kind === "email" && <EmailFields log={log as EmailLog} set={p => patch<EmailLog>(p)} />}
          {log.kind === "note" && <NoteFields log={log as NoteLog} set={p => patch<NoteLog>(p)} />}

          {/* ── เนื้อหาหลัก ── */}
          <SectionTitle>เนื้อหาการสนทนา</SectionTitle>

          <Field label="เรื่องที่คุย / หัวข้อหลัก *">
            <Input
              value={log.topic}
              onChange={e => patch({ topic: e.target.value })}
              placeholder={
                log.kind === "call" ? "เช่น ติดตามใบเสนอราคา QT-2026-0012" :
                log.kind === "meeting" ? "เช่น นำเสนอโซลูชัน AI สำหรับคลังสินค้า" :
                log.kind === "line" ? "เช่น ส่งไฟล์ใบเสนอราคาและรอคำตอบ" :
                log.kind === "email" ? "เช่น ติดตามผลการอนุมัติงบประมาณ" :
                "หัวข้อบันทึก"
              }
            />
          </Field>

          <Field label="ประเด็นสำคัญที่พูดถึง">
            <Textarea
              rows={2}
              value={log.issues}
              onChange={e => patch({ issues: e.target.value })}
              placeholder="เช่น ลูกค้าสนใจ Package B แต่ยังกังวลเรื่องราคา, ขอเปรียบเทียบกับคู่แข่งอีกราย"
            />
          </Field>

          {/* ── ขั้นตอนต่อไป ── */}
          <SectionTitle>ขั้นตอนต่อไป (Next Steps)</SectionTitle>

          <Field label="สิ่งที่ต้องทำต่อ">
            <Textarea
              rows={2}
              value={log.next_action}
              onChange={e => patch({ next_action: e.target.value })}
              placeholder="เช่น ส่งใบเสนอราคาฉบับแก้ไขภายใน 7 ก.ค., โทรติดตามผลอีกครั้ง 10 ก.ค."
            />
          </Field>

          <Field label="วันนัดครั้งต่อไป">
            <Input type="date" value={log.next_date} onChange={e => patch({ next_date: e.target.value })} />
          </Field>

          {/* ── ประเมินผล ── */}
          <SectionTitle>ประเมินผลการสนทนา</SectionTitle>

          <Field label="ผลลัพธ์โดยรวม">
            <ResultPicker value={log.result} onChange={v => patch({ result: v })} />
          </Field>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Label style={{ fontSize: 11, color: "var(--text-muted)" }}>
                ท่าทีของลูกค้า / ความพร้อม
              </Label>
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                color: sentimentColor(log.sentiment),
              }}>
                {sentimentLabel(log.sentiment)}
              </span>
            </div>
            <Slider
              min={1}
              max={5}
              step={1}
              value={[log.sentiment]}
              onValueChange={([v]) => patch({ sentiment: v })}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--text-muted)" }}>
              <span>เย็นชา</span>
              <span>ระมัดระวัง</span>
              <span>เป็นกลาง</span>
              <span>สนใจ</span>
              <span>พร้อมซื้อ</span>
            </div>
          </div>

          {/* ── หมายเหตุเพิ่มเติม ── */}
          <Field label="หมายเหตุ / รายละเอียดอื่น ๆ">
            <Textarea
              rows={2}
              value={log.notes}
              onChange={e => patch({ notes: e.target.value })}
              placeholder="ข้อมูลเพิ่มเติมที่ควรจำ..."
            />
          </Field>

        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8, borderTop: "0.5px solid var(--border)" }}>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            บันทึกกิจกรรม
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
