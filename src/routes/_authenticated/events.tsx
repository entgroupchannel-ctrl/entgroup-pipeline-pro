import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Cake, CalendarDays, Star, Phone, Mail, MessageCircle, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";
import { ActivityLogDialog } from "@/components/activities/ActivityLogDialog";

// @ts-ignore — route registered at build time
export const Route = createFileRoute("/_authenticated/events")({
  component: EventsPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface CRMEvent {
  id: string;
  type: "birthday" | "company_anniv" | "customer_anniv";
  label: string;           // contact name or company name
  detail?: string;         // position / years
  accountId: string | null;
  accountName?: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
  contactLineId?: string | null;
  eventDate: string;       // YYYY-MM-DD original date
  nextOccurrence: Date;    // next occurrence this year or next
  daysUntil: number;
}

const MONTHS_TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

function nextOccurrenceOf(dateStr: string): Date | null {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const thisYear = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  return thisYear >= now ? thisYear : new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
}

function daysUntilDate(target: Date): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

function formatDateTH(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()} ${MONTHS_TH[d.getMonth()]}`;
}

// ── Event config ──────────────────────────────────────────────────────────────

const EVENT_CONFIG = {
  birthday:       { label: "วันเกิด",          icon: Cake,        color: "#D85A30", bg: "#FAECE7", textColor: "#993C1D" },
  company_anniv:  { label: "ครบรอบก่อตั้ง",    icon: CalendarDays, color: "#185FA5", bg: "#E6F1FB", textColor: "#0C447C" },
  customer_anniv: { label: "ครบรอบลูกค้า",     icon: Star,        color: "#BA7517", bg: "#FAEEDA", textColor: "#633806" },
};

function DaysUntilBadge({ days }: { days: number }) {
  const color =
    days === 0  ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300" :
    days <= 7   ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" :
    days <= 30  ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" :
                  "bg-muted text-muted-foreground";
  const text = days === 0 ? "วันนี้ 🎉" : days === 1 ? "พรุ่งนี้" : `อีก ${days} วัน`;
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${color}`}>{text}</span>;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function EventsPage() {
  const [events, setEvents] = useState<CRMEvent[] | null>(null);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | CRMEvent["type"]>("all");
  const [windowDays, setWindowDays] = useState(90); // how many days to show
  const [logOpen, setLogOpen] = useState(false);
  const [logLeadId] = useState<string | null>(null);

  const load = async () => {
    const [contactsRes, accountsRes] = await Promise.all([
      crmDb().from("contacts").select("id,name,nickname,position,phone,email,line_id,birth_date,account_id,accounts:account_id(id,name)").not("birth_date","is",null),
      crmDb().from("accounts").select("id,name,founded_date,customer_since").or("founded_date.not.is.null,customer_since.not.is.null"),
    ]);

    const all: CRMEvent[] = [];

    for (const c of (contactsRes.data ?? []) as any[]) {
      if (!c.birth_date) continue;
      const next = nextOccurrenceOf(c.birth_date);
      if (!next) continue; // skip invalid dates
      all.push({
        id: `birthday-${c.id}`,
        type: "birthday",
        label: c.nickname ?? c.name,
        detail: c.position ?? undefined,
        accountId: c.account_id,
        accountName: (c.accounts as any)?.name,
        contactPhone: c.phone,
        contactEmail: c.email,
        contactLineId: c.line_id,
        eventDate: c.birth_date,
        nextOccurrence: next,
        daysUntil: daysUntilDate(next),
      });
    }

    for (const a of (accountsRes.data ?? []) as any[]) {
      if (a.founded_date) {
        const next = nextOccurrenceOf(a.founded_date);
        if (next) {
          const years = new Date().getFullYear() - new Date(a.founded_date).getFullYear();
          all.push({
            id: `company-${a.id}`,
            type: "company_anniv",
            label: a.name,
            detail: `ปีที่ ${years}`,
            accountId: a.id,
            accountName: a.name,
            eventDate: a.founded_date,
            nextOccurrence: next,
            daysUntil: daysUntilDate(next),
          });
        }
      }
      if (a.customer_since) {
        const next = nextOccurrenceOf(a.customer_since);
        if (next) {
          const years = new Date().getFullYear() - new Date(a.customer_since).getFullYear();
          all.push({
            id: `customer-${a.id}`,
            type: "customer_anniv",
            label: a.name,
            detail: `ลูกค้ามา ${years} ปี`,
            accountId: a.id,
            accountName: a.name,
            eventDate: a.customer_since,
            nextOccurrence: next,
            daysUntil: daysUntilDate(next),
          });
        }
      }
    }

    all.sort((a, b) => a.daysUntil - b.daysUntil);
    setEvents(all);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!events) return null;
    return events.filter((e) => {
      if (e.daysUntil > windowDays) return false;
      if (typeFilter !== "all" && e.type !== typeFilter) return false;
      if (q.trim()) {
        const ql = q.toLowerCase();
        if (!e.label.toLowerCase().includes(ql) && !(e.accountName ?? "").toLowerCase().includes(ql)) return false;
      }
      return true;
    });
  }, [events, q, typeFilter, windowDays]);

  // Group by month
  const grouped = useMemo(() => {
    if (!filtered) return [];
    const map = new Map<string, CRMEvent[]>();
    for (const ev of filtered) {
      const d = ev.nextOccurrence;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return Array.from(map.entries()).map(([key, items]) => {
      const [y, m] = key.split("-").map(Number);
      return { key, monthLabel: `${MONTHS_TH[m - 1]} ${y + 543}`, items };
    });
  }, [filtered]);

  const todayCount   = events?.filter((e) => e.daysUntil === 0).length ?? 0;
  const weekCount    = events?.filter((e) => e.daysUntil <= 7).length ?? 0;
  const monthCount   = events?.filter((e) => e.daysUntil <= 30).length ?? 0;

  return (
    <div className="p-6 page-fade-in max-w-4xl">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">วันสำคัญลูกค้า</h1>
          <p className="text-xs text-muted-foreground">วันเกิด, ครบรอบก่อตั้ง, ครบรอบการเป็นลูกค้า</p>
        </div>
        {/* Quick stats */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {todayCount > 0 && (
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
              🎉 วันนี้ {todayCount}
            </span>
          )}
          {weekCount > todayCount && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              สัปดาห์นี้ {weekCount}
            </span>
          )}
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            เดือนนี้ {monthCount}
          </span>
        </div>
      </div>

      {/* Filters */}
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
        <div className="flex items-center gap-1">
          {([30, 60, 90, 180, 365] as const).map((d) => (
            <button
              key={d}
              onClick={() => setWindowDays(d)}
              className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                windowDays === d
                  ? "bg-primary text-primary-foreground"
                  : "border hover:bg-muted"
              }`}
            >
              {d < 365 ? `${d} วัน` : "1 ปี"}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {filtered === null ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed py-14 text-center">
          <CalendarDays className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">ไม่พบวันสำคัญในช่วงเวลาที่เลือก</p>
          <p className="mt-1 text-xs text-muted-foreground">เพิ่มวันเกิด / วันก่อตั้งใน "รายชื่อลูกค้า" ได้เลย</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ key, monthLabel, items }) => (
            <div key={key}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">{monthLabel}</span>
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">{items.length} รายการ</span>
              </div>
              <div className="space-y-2">
                {items.map((ev) => {
                  const cfg = EVENT_CONFIG[ev.type];
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={ev.id}
                      className={`flex items-start gap-3 rounded-xl border bg-card p-3.5 transition-shadow hover:shadow-sm ${
                        ev.daysUntil === 0 ? "border-amber-300 dark:border-amber-700" : ""
                      }`}
                    >
                      {/* Type icon */}
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                        style={{ background: cfg.bg }}
                      >
                        <Icon className="h-4 w-4" style={{ color: cfg.color }} />
                      </div>

                      {/* Main info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{ev.label}</span>
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{ background: cfg.bg, color: cfg.textColor }}
                          >
                            {cfg.label}
                          </span>
                          {ev.detail && (
                            <span className="text-xs text-muted-foreground">{ev.detail}</span>
                          )}
                        </div>
                        {ev.accountName && ev.type === "birthday" && (
                          <div className="text-xs text-muted-foreground mt-0.5">{ev.accountName}</div>
                        )}
                        {/* Date display */}
                        <div className="mt-1 flex items-center gap-3 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            {formatDateTH(ev.eventDate)} ทุกปี
                          </span>
                          {/* Contact actions */}
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

                      {/* Right: days until + account link */}
                      <div className="shrink-0 flex flex-col items-end gap-1.5">
                        <DaysUntilBadge days={ev.daysUntil} />
                        {ev.accountId && (
                          <Link
                            to="/accounts/$accountId"
                            params={{ accountId: ev.accountId }}
                            className="text-[10px] text-muted-foreground hover:text-primary hover:underline"
                          >
                            ดูบริษัท →
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
