import { Phone, Mail, Users, FileText, MessageCircle, type LucideIcon } from "lucide-react";

const MONTHS_TH = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

export function formatThaiDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  const yy = String(d.getFullYear() + 543).slice(-2);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${d.getDate()} ${MONTHS_TH[d.getMonth()]} ${yy}, ${hh}:${mm}`;
}

export function timeFromNow(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return "เลยกำหนด";
  const h = Math.floor(diff / 3600000);
  if (h < 1) {
    const m = Math.max(1, Math.floor(diff / 60000));
    return `อีก ${m} นาที`;
  }
  if (h < 24) return `อีก ${h} ชม.`;
  return `อีก ${Math.floor(h / 24)} วัน`;
}

export const ACTIVITY_TYPES = ["call", "email", "meeting", "note", "line"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  call: "โทร",
  email: "อีเมล",
  meeting: "นัดประชุม",
  note: "โน้ต",
  line: "Line",
};

export function activityIcon(type: string): LucideIcon {
  switch (type) {
    case "call": return Phone;
    case "email": return Mail;
    case "meeting": return Users;
    case "note": return FileText;
    case "line": return MessageCircle;
    default: return FileText;
  }
}

export interface Activity {
  id: string;
  lead_id: string | null;
  type: string;
  subject: string | null;
  body: string | null;
  due_at: string | null;
  done: boolean;
  done_at: string | null;
  owner_id: string | null;
  created_at: string;
}
