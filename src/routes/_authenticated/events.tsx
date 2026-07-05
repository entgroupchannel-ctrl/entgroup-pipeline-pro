import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2, Cake, CalendarDays, Star, Phone, Mail, MessageCircle,
  ChevronLeft, ChevronRight, LayoutList, Grid3x3, Plus, Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

// @ts-ignore — route registered at build time
export const Route = createFileRoute("/_authenticated/events")({
  component: EventsPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface CustomEvent {
  id: string;
  title: string;
  event_date: string;
  event_type: "custom" | "reminder" | "holiday" | "meeting";
  description: string | null;
  account_id: string | null;
  is_recurring: boolean;
  color: string;
  created_by: string | null;
}

interface CRMEvent {
  id: string;
  type: "birthday" | "company_anniv" | "customer_anniv" | "custom_event";
  label: string;
  detail?: string;
  accountId: string | null;
  accountName?: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
  contactLineId?: string | null;
  eventDate: string;        // original YYYY-MM-DD
  nextOccurrence: Date;     // next occurrence this year or next
  daysUntil: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS_TH     = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const MONTHS_TH_FULL = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
const DOW_TH        = ["อา","จ","อ","พ","พฤ","ศ","ส"];

const EVENT_CONFIG = {
  birthday:       { label: "วันเกิด",        icon: Cake,         color: "#D85A30", bg: "#FAECE7", textColor: "#993C1D", dot: "#D85A30" },
  company_anniv:  { label: "ครบรอบก่อตั้ง",  icon: CalendarDays, color: "#185FA5", bg: "#E6F1FB", textColor: "#0C447C", dot: "#378ADD" },
  customer_anniv: { label: "ครบรอบลูกค้า",   icon: Star,         color: "#BA7517", bg: "#FAEEDA", textColor: "#633806", dot: "#EF9F27" },
  custom_event: { label: "วันสำคัญ", icon: Star, color: "#185FA5", bg: "#E6F1FB", textColor: "#0C447C", dot: "#185FA5" },
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function nextOccurrenceOf(dateStr: string): Date | null {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const thisYear = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  return thisYear >= now
    ? thisYear
    : new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
}

function daysUntilDate(target: Date): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

function formatDateTH(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()} ${MONTHS_TH[d.getMonth()]}`;
}

function DaysUntilBadge({ days }: { days: number }) {
  const color =
    days === 0 ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300" :
    days <= 7  ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" :
    days <= 30 ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" :
                 "bg-muted text-muted-foreground";
  const text = days === 0 ? "วันนี้ 🎉" : days === 1 ? "พรุ่งนี้" : `อีก ${days} วัน`;
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${color}`}>{text}</span>;
}

// ── Calendar Grid ─────────────────────────────────────────────────────────────

interface CalendarProps {
  year: number;
  month: number; // 0-indexed
  eventsByDay: Map<number, CRMEvent[]>; // day-of-month → events
  onDayClick: (day: number) => void;
  selectedDay: number | null;
}

function CalendarGrid({ year, month, eventsByDay, onDayClick, selectedDay }: CalendarProps) {
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const todayDay = isCurrentMonth ? today.getDate() : -1;

  // Build grid cells
  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {DOW_TH.map((d) => (
          <div key={d} className="py-2 text-center text-[11px] font-medium text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Date cells */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (!day) {
            return <div key={`empty-${idx}`} className="border-b border-r last:border-r-0 h-20 bg-muted/10" />;
          }
          const dayEvents = eventsByDay.get(day) ?? [];
          const isToday = day === todayDay;
          const isSelected = day === selectedDay;
          const hasEvents = dayEvents.length > 0;

          // Count by type for colored dots
          const birthdays  = dayEvents.filter((e) => e.type === "birthday").length;
          const companyAnn = dayEvents.filter((e) => e.type === "company_anniv").length;
          const custAnn    = dayEvents.filter((e) => e.type === "customer_anniv").length;

          return (
            <button
              key={day}
              onClick={() => onDayClick(day)}
              className={`relative flex flex-col items-start border-b border-r last:border-r-0 h-20 p-1.5 text-left transition-colors focus:outline-none
                ${isSelected ? "bg-primary/10" : hasEvents ? "hover:bg-muted/40" : "hover:bg-muted/20"}
                ${(idx + 1) % 7 === 0 ? "border-r-0" : ""}
              `}
            >
              {/* Day number */}
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition-colors
                  ${isToday ? "bg-primary text-primary-foreground" : isSelected ? "bg-primary/20 text-primary" : "text-foreground"}
                `}
              >
                {day}
              </span>

              {/* Event dots + count */}
              {hasEvents && (
                <div className="mt-1 flex flex-col gap-0.5 w-full">
                  {birthdays > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: EVENT_CONFIG.birthday.dot }} />
                      <span className="text-[10px] text-muted-foreground truncate">
                        {birthdays > 1 ? `วันเกิด ${birthdays}` : "วันเกิด"}
                      </span>
                    </div>
                  )}
                  {companyAnn > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: EVENT_CONFIG.company_anniv.dot }} />
                      <span className="text-[10px] text-muted-foreground truncate">
                        {companyAnn > 1 ? `ครบรอบ ${companyAnn}` : "ครบรอบก่อตั้ง"}
                      </span>
                    </div>
                  )}
                  {custAnn > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: EVENT_CONFIG.customer_anniv.dot }} />
                      <span className="text-[10px] text-muted-foreground truncate">
                        {custAnn > 1 ? `ลูกค้า ${custAnn}` : "ครบรอบลูกค้า"}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Total badge if > 3 types */}
              {dayEvents.length > 3 && (
                <span className="absolute bottom-1 right-1.5 text-[9px] font-semibold text-muted-foreground">
                  +{dayEvents.length - 3}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Event Card ────────────────────────────────────────────────────────────────

function EventCard({ ev }: { ev: CRMEvent }) {
  const cfg = EVENT_CONFIG[ev.type];
  const Icon = cfg.icon;
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border bg-card p-3.5 transition-shadow hover:shadow-sm ${
        ev.daysUntil === 0 ? "border-amber-300 dark:border-amber-700" : ""
      }`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: cfg.bg }}>
        <Icon className="h-4 w-4" style={{ color: cfg.color }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{ev.label}</span>
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: cfg.bg, color: cfg.textColor }}>
            {cfg.label}
          </span>
          {ev.detail && <span className="text-xs text-muted-foreground">{ev.detail}</span>}
        </div>
        {ev.accountName && ev.type === "birthday" && (
          <div className="text-xs text-muted-foreground mt-0.5">{ev.accountName}</div>
        )}
        <div className="mt-1 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-muted-foreground">{formatDateTH(ev.eventDate)} ทุกปี</span>
          <div className="flex items-center gap-2">
            {ev.contactPhone && (
              <a href={`tel:${ev.contactPhone}`} className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                <Phone className="h-3 w-3" />โทร
              </a>
            )}
            {ev.contactEmail && (
              <a href={`mailto:${ev.contactEmail}`} className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                <Mail className="h-3 w-3" />อีเมล
              </a>
            )}
            {ev.contactLineId && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <MessageCircle className="h-3 w-3" />{ev.contactLineId}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1.5">
        <DaysUntilBadge days={ev.daysUntil} />
        {ev.accountId && (
          <Link to="/accounts/$accountId" params={{ accountId: ev.accountId }}
            className="text-[10px] text-muted-foreground hover:text-primary hover:underline">
            ดูบริษัท →
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function EventsPage() {
  const today = new Date();
  const { user } = useAuth();

  const [events, setEvents]             = useState<CRMEvent[] | null>(null);
  const [customEvents, setCustomEvents] = useState<CustomEvent[]>([]);
  const [q, setQ]                       = useState("");
  const [typeFilter, setTypeFilter]     = useState<"all" | CRMEvent["type"]>("all");
  const [viewMode, setViewMode]         = useState<"calendar" | "list">("calendar");

  // Calendar navigation state
  const [calYear, setCalYear]   = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // Add event dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDate, setAddDate]   = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [addType, setAddType]   = useState<CustomEvent["event_type"]>("custom");
  const [addDesc, setAddDesc]   = useState("");
  const [addRecurring, setAddRecurring] = useState(false);
  const [addColor, setAddColor] = useState("#185FA5");
  const [saving, setSaving]     = useState(false);

  // Load ALL events (no window filter — calendar shows the month you're on)
  const load = async () => {
    const [contactsRes, accountsRes] = await Promise.all([
      crmDb()
        .from("contacts")
        .select("id,name,nickname,position,phone,email,line_id,birth_date,account_id,accounts:account_id(id,name)")
        .not("birth_date", "is", null),
      crmDb()
        .from("accounts")
        .select("id,name,founded_date,customer_since")
        .or("founded_date.not.is.null,customer_since.not.is.null"),
    ]);

    const all: CRMEvent[] = [];

    for (const c of (contactsRes.data ?? []) as any[]) {
      if (!c.birth_date) continue;
      const next = nextOccurrenceOf(c.birth_date);
      if (!next) continue;
      all.push({
        id: `birthday-${c.id}`, type: "birthday",
        label: c.nickname ?? c.name, detail: c.position ?? undefined,
        accountId: c.account_id, accountName: (c.accounts as any)?.name,
        contactPhone: c.phone, contactEmail: c.email, contactLineId: c.line_id,
        eventDate: c.birth_date, nextOccurrence: next, daysUntil: daysUntilDate(next),
      });
    }

    for (const a of (accountsRes.data ?? []) as any[]) {
      if (a.founded_date) {
        const next = nextOccurrenceOf(a.founded_date);
        if (next) {
          const years = new Date().getFullYear() - new Date(a.founded_date).getFullYear();
          all.push({
            id: `company-${a.id}`, type: "company_anniv",
            label: a.name, detail: `ปีที่ ${years}`,
            accountId: a.id, accountName: a.name,
            eventDate: a.founded_date, nextOccurrence: next, daysUntil: daysUntilDate(next),
          });
        }
      }
      if (a.customer_since) {
        const next = nextOccurrenceOf(a.customer_since);
        if (next) {
          const years = new Date().getFullYear() - new Date(a.customer_since).getFullYear();
          all.push({
            id: `customer-${a.id}`, type: "customer_anniv",
            label: a.name, detail: `ลูกค้ามา ${years} ปี`,
            accountId: a.id, accountName: a.name,
            eventDate: a.customer_since, nextOccurrence: next, daysUntil: daysUntilDate(next),
          });
        }
      }
    }

    all.sort((a, b) => a.daysUntil - b.daysUntil);
    setEvents(all);
  };

  const loadCustomEvents = async () => {
    const { data } = await crmDb().from("custom_events").select("*").order("event_date");
    setCustomEvents((data ?? []) as CustomEvent[]);
  };

  const saveCustomEvent = async () => {
    if (!addTitle.trim()) { toast.error("กรุณาระบุชื่อวันสำคัญ"); return; }
    if (!addDate)          { toast.error("กรุณาเลือกวันที่");       return; }
    setSaving(true);
    const { error } = await crmDb().from("custom_events").insert({
      title: addTitle.trim(), event_date: addDate, event_type: addType,
      description: addDesc.trim() || null, is_recurring: addRecurring,
      color: addColor, created_by: user?.id,
    });
    setSaving(false);
    if (error) { toast.error("บันทึกไม่สำเร็จ", { description: error.message }); return; }
    toast.success(`เพิ่ม "${addTitle}" แล้ว`);
    setAddDialogOpen(false);
    setAddTitle(""); setAddDesc(""); setAddType("custom"); setAddRecurring(false); setAddColor("#185FA5");
    await loadCustomEvents();
  };

  const deleteCustomEvent = async (id: string) => {
    const { error } = await crmDb().from("custom_events").delete().eq("id", id);
    if (error) { toast.error("ลบไม่สำเร็จ"); return; }
    toast.success("ลบแล้ว");
    await loadCustomEvents();
  };

  const openAddDialog = (day?: number) => {
    if (day) {
      const d = new Date(calYear, calMonth, day);
      setAddDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`);
    } else {
      setAddDate("");
    }
    setAddTitle(""); setAddDesc(""); setAddType("custom"); setAddRecurring(false); setAddColor("#185FA5");
    setAddDialogOpen(true);
  };

  useEffect(() => { load(); loadCustomEvents(); }, []);

  // Events that occur in the currently viewed calendar month
  const calMonthEvents = useMemo(() => {
    if (!events) return [];
    return events.filter((e) => {
      const d = e.nextOccurrence;
      return d.getFullYear() === calYear && d.getMonth() === calMonth;
    });
  }, [events, calYear, calMonth]);

  // Map: day → events (for CalendarGrid) — merge CRM events + custom events
  const eventsByDay = useMemo(() => {
    const map = new Map<number, CRMEvent[]>();
    for (const ev of calMonthEvents) {
      const day = ev.nextOccurrence.getDate();
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(ev);
    }
    // Add custom events for this month
    for (const ce of customEvents) {
      const d = new Date(ce.event_date);
      const matchMonth = ce.is_recurring
        ? d.getMonth() === calMonth // recurring: match month/day any year
        : d.getFullYear() === calYear && d.getMonth() === calMonth;
      if (!matchMonth) continue;
      const day = d.getDate();
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push({
        id: `custom-${ce.id}`, type: "custom_event",
        label: ce.title, detail: ce.description ?? undefined,
        accountId: null, eventDate: ce.event_date,
        nextOccurrence: new Date(calYear, calMonth, day),
        daysUntil: daysUntilDate(new Date(calYear, calMonth, day)),
        _customId: ce.id, _color: ce.color,
      } as any);
    }
    return map;
  }, [calMonthEvents, customEvents, calYear, calMonth]);

  // Events for selected day (calendar detail panel)
  const selectedDayEvents = useMemo(() => {
    if (!selectedDay) return [];
    return eventsByDay.get(selectedDay) ?? [];
  }, [selectedDay, eventsByDay]);

  // List view: apply type + search filters
  const listFiltered = useMemo(() => {
    if (!events) return null;
    return events.filter((e) => {
      if (typeFilter !== "all" && e.type !== typeFilter) return false;
      if (q.trim()) {
        const ql = q.toLowerCase();
        if (!e.label.toLowerCase().includes(ql) && !(e.accountName ?? "").toLowerCase().includes(ql)) return false;
      }
      return true;
    });
  }, [events, q, typeFilter]);

  // Group list by month
  const listGrouped = useMemo(() => {
    if (!listFiltered) return [];
    const map = new Map<string, CRMEvent[]>();
    for (const ev of listFiltered) {
      const d = ev.nextOccurrence;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return Array.from(map.entries()).map(([key, items]) => {
      const [y, m] = key.split("-").map(Number);
      return { key, monthLabel: `${MONTHS_TH_FULL[m - 1]} ${y + 543}`, items };
    });
  }, [listFiltered]);

  // Summary stats (from full unfiltered events)
  const todayCount = events?.filter((e) => e.daysUntil === 0).length ?? 0;
  const weekCount  = events?.filter((e) => e.daysUntil <= 7 && e.daysUntil > 0).length ?? 0;

  // Calendar nav
  const prevMonth = () => {
    if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11); }
    else setCalMonth((m) => m - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0); }
    else setCalMonth((m) => m + 1);
    setSelectedDay(null);
  };
  const goToday = () => {
    setCalYear(today.getFullYear());
    setCalMonth(today.getMonth());
    setSelectedDay(today.getDate());
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-6 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-base font-semibold">วันสำคัญลูกค้า</h1>
            <p className="text-[11px] text-muted-foreground">วันเกิด · ครบรอบก่อตั้ง · ครบรอบลูกค้า</p>
          </div>
          {/* Quick badges */}
          <div className="flex items-center gap-1.5 ml-2">
            {todayCount > 0 && (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                🎉 วันนี้ {todayCount}
              </span>
            )}
            {weekCount > 0 && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                สัปดาห์นี้ {weekCount}
              </span>
            )}
          </div>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border overflow-hidden">
            <button
              onClick={() => setViewMode("calendar")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${
                viewMode === "calendar" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              <Grid3x3 className="h-3.5 w-3.5" /> ปฏิทิน
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors border-l ${
                viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              <LayoutList className="h-3.5 w-3.5" /> รายการ
            </button>
          </div>
        </div>
      </div>

      {/* ── Loading ── */}
      {events === null ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : viewMode === "calendar" ? (
        /* ── CALENDAR VIEW ── */
        <div className="flex flex-1 gap-0 overflow-hidden">
          {/* Calendar panel */}
          <div className="flex flex-col flex-1 overflow-y-auto p-5">
            {/* Month navigation */}
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={prevMonth} className="rounded-lg border p-1.5 hover:bg-muted transition-colors">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <h2 className="text-base font-semibold min-w-[160px] text-center">
                  {MONTHS_TH_FULL[calMonth]} {calYear + 543}
                </h2>
                <button onClick={nextMonth} className="rounded-lg border p-1.5 hover:bg-muted transition-colors">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                {/* Month event count */}
                <span className="text-xs text-muted-foreground">
                  {calMonthEvents.length > 0
                    ? `${calMonthEvents.length} เหตุการณ์เดือนนี้`
                    : "ไม่มีเหตุการณ์เดือนนี้"}
                </span>
                <button
                  onClick={() => openAddDialog()}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> เพิ่มวันสำคัญ
                </button>
                <button
                  onClick={goToday}
                  className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                >
                  วันนี้
                </button>
              </div>
            </div>

            {/* Legend */}
            <div className="mb-3 flex items-center gap-4 flex-wrap">
              {(Object.entries(EVENT_CONFIG) as [string, typeof EVENT_CONFIG.birthday][]).map(([type, cfg]) => (
                <div key={type} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ background: cfg.dot }} />
                  {cfg.label}
                </div>
              ))}
            </div>

            <CalendarGrid
              year={calYear}
              month={calMonth}
              eventsByDay={eventsByDay}
              onDayClick={(day) => {
                const hasEvents = (eventsByDay.get(day) ?? []).length > 0;
                if (hasEvents) {
                  setSelectedDay(selectedDay === day ? null : day);
                } else {
                  // Empty day → open add dialog with pre-filled date
                  openAddDialog(day);
                }
              }}
              selectedDay={selectedDay}
            />
          </div>

          {/* Day detail side panel */}
          <div
            className={`border-l bg-card transition-all duration-200 overflow-y-auto shrink-0 ${
              selectedDay && selectedDayEvents.length > 0
                ? "w-80 p-4"
                : "w-0 p-0 overflow-hidden"
            }`}
          >
            {selectedDay && selectedDayEvents.length > 0 && (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    {selectedDay} {MONTHS_TH_FULL[calMonth]} {calYear + 543}
                  </h3>
                  <button
                    onClick={() => openAddDialog(selectedDay!)}
                    className="flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] text-muted-foreground hover:bg-primary/5 hover:text-primary hover:border-primary transition-colors"
                  >
                    <Plus className="h-3 w-3" /> เพิ่ม
                  </button>
                </div>
                <div className="space-y-2">
                  {selectedDayEvents.map((ev) => {
                    const cfg = EVENT_CONFIG[ev.type];
                    const Icon = cfg.icon;
                    return (
                      <div
                        key={ev.id}
                        className="rounded-lg border p-3"
                        style={{ borderLeftWidth: 3, borderLeftColor: cfg.color }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: cfg.color }} />
                          <span className="text-sm font-medium truncate">{ev.label}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mb-1.5">{cfg.label}{ev.detail ? ` · ${ev.detail}` : ""}</div>
                        {ev.accountName && ev.type === "birthday" && (
                          <div className="text-[11px] text-muted-foreground mb-1.5">{ev.accountName}</div>
                        )}
                        <DaysUntilBadge days={ev.daysUntil} />
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          {ev.contactPhone && (
                            <a href={`tel:${ev.contactPhone}`} className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                              <Phone className="h-3 w-3" />โทร
                            </a>
                          )}
                          {ev.contactEmail && (
                            <a href={`mailto:${ev.contactEmail}`} className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                              <Mail className="h-3 w-3" />อีเมล
                            </a>
                          )}
                          {ev.accountId && (
                            <Link
                              to="/accounts/$accountId"
                              params={{ accountId: ev.accountId }}
                              className="text-[11px] text-muted-foreground hover:text-primary hover:underline"
                            >
                              ดูบริษัท →
                            </Link>
                          )}
                          {(ev as any)._customId && (
                            <button
                              onClick={() => deleteCustomEvent((ev as any)._customId)}
                              className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="h-3 w-3" /> ลบ
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        /* ── LIST VIEW ── */
        <div className="flex-1 overflow-y-auto p-6 max-w-4xl">
          {/* List filters */}
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาชื่อ หรือบริษัท…"
              className="h-9 w-48 text-sm"
            />
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
              <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกประเภท</SelectItem>
                <SelectItem value="birthday">วันเกิด</SelectItem>
                <SelectItem value="company_anniv">ครบรอบก่อตั้ง</SelectItem>
                <SelectItem value="customer_anniv">ครบรอบลูกค้า</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {listFiltered === null || listFiltered.length === 0 ? (
            <div className="rounded-xl border border-dashed py-14 text-center">
              <CalendarDays className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">ไม่พบวันสำคัญ</p>
              <p className="mt-1 text-xs text-muted-foreground">เพิ่มวันเกิด / วันก่อตั้งใน "รายชื่อลูกค้า" ได้เลย</p>
            </div>
          ) : (
            <div className="space-y-6">
              {listGrouped.map(({ key, monthLabel, items }) => (
                <div key={key}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">{monthLabel}</span>
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs text-muted-foreground">{items.length} รายการ</span>
                  </div>
                  <div className="space-y-2">
                    {items.map((ev) => <EventCard key={ev.id} ev={ev} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Add Custom Event Dialog ── */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" />
              เพิ่มวันสำคัญ
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {/* Title */}
            <div className="space-y-1.5">
              <Label className="text-xs">ชื่อวันสำคัญ <span className="text-red-500">*</span></Label>
              <input
                autoFocus
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="เช่น วันครบรอบสัญญา, วันหยุดธนาคาร"
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveCustomEvent()}
              />
            </div>

            {/* Date + Type in 2 col */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">วันที่ <span className="text-red-500">*</span></Label>
                <input
                  type="date"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={addDate}
                  onChange={(e) => setAddDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">ประเภท</Label>
                <Select value={addType} onValueChange={(v) => setAddType(v as CustomEvent["event_type"])}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">📌 วันสำคัญทั่วไป</SelectItem>
                    <SelectItem value="reminder">🔔 แจ้งเตือน</SelectItem>
                    <SelectItem value="holiday">🏖 วันหยุด</SelectItem>
                    <SelectItem value="meeting">👥 นัดประชุม</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-xs">รายละเอียด (optional)</Label>
              <Textarea
                rows={2}
                placeholder="รายละเอียดเพิ่มเติม..."
                value={addDesc}
                onChange={(e) => setAddDesc(e.target.value)}
                className="resize-none text-sm"
              />
            </div>

            {/* Color + Recurring */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="text-xs">สี</Label>
                <div className="flex gap-1.5">
                  {["#185FA5","#D85A30","#3B6D11","#BA7517","#7C3AED","#E24B4A"].map((c) => (
                    <button
                      key={c}
                      onClick={() => setAddColor(c)}
                      className={`h-5 w-5 rounded-full transition-transform ${addColor === c ? "ring-2 ring-offset-1 ring-foreground scale-110" : ""}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addRecurring}
                  onChange={(e) => setAddRecurring(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                <span className="text-xs text-muted-foreground">เกิดซ้ำทุกปี</span>
              </label>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="ghost" onClick={() => setAddDialogOpen(false)}>ยกเลิก</Button>
            <Button onClick={saveCustomEvent} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              บันทึกวันสำคัญ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}