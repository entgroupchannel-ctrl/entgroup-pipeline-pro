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

export const ACTIVITY_TYPE_COLOR: Record<string, { bg: string; text: string; icon: string }> = {
  call:    { bg: "bg-emerald-100 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-300", icon: "text-emerald-600 dark:text-emerald-400" },
  email:   { bg: "bg-violet-100 dark:bg-violet-950/40",  text: "text-violet-700 dark:text-violet-300",  icon: "text-violet-600 dark:text-violet-400"  },
  meeting: { bg: "bg-blue-100 dark:bg-blue-950/40",      text: "text-blue-700 dark:text-blue-300",      icon: "text-blue-600 dark:text-blue-400"      },
  note:    { bg: "bg-amber-100 dark:bg-amber-950/40",    text: "text-amber-700 dark:text-amber-300",    icon: "text-amber-600 dark:text-amber-400"    },
  line:    { bg: "bg-green-100 dark:bg-green-950/40",    text: "text-green-700 dark:text-green-300",    icon: "text-green-600 dark:text-green-400"    },
};
