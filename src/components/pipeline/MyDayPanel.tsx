/**
 * MyDayPanel — Sales "inbox" showing today's tasks, upcoming events,
 * and deals that need follow-up. Appears as a collapsible panel on Pipeline.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronDown, ChevronUp, Phone, Mail, MessageCircle, Users,
  FileText, CalendarDays, Star, AlertTriangle, CheckCircle2,
  Clock, ArrowRight,
} from "lucide-react";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";
import { activityIcon, type Activity } from "@/lib/activities";
import { ActivityLogDialog, type ActivityKind } from "@/components/activities/ActivityLogDialog";

// ── helpers ───────────────────────────────────────────────────────────────────

const MONTHS_TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

function formatTimeTH(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;
}

function formatDateShortTH(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()} ${MONTHS_TH[d.getMonth()]}`;
}

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date(); now.setHours(0,0,0,0);
  const target = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  let diff = Math.round((target.getTime() - now.getTime()) / 86400000);
  if (diff < 0) diff += 365; // next year
  return diff;
}

interface UpcomingEvent {
  type: "birthday" | "company_anniv" | "customer_anniv";
  label: string;
  accountId: string | null;
  contactId: string | null;
  days: number;
  detail?: string;
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  /** collapse/expand state saved per session */
  defaultOpen?: boolean;
  onRefresh?: () => void;
}

export function MyDayPanel({ defaultOpen = true, onRefresh }: Props) {
  const { user, role } = useAuth();
  const isManager = role === "manager" || role === "admin";

  const [open, setOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(true);

  const [overdueActs, setOverdueActs] = useState<Activity[]>([]);
  const [todayActs, setTodayActs] = useState<Activity[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [staleDeals, setStaleDeals] = useState<{ id: string; title: string; days: number; account: string }[]>([]);

  // Quick-log dialog
  const [logOpen, setLogOpen] = useState(false);
  const [logLeadId, setLogLeadId] = useState<string | null>(null);
  const [logKind, setLogKind] = useState<ActivityKind>("call");

  const load = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
      const endOfDay   = new Date(now); endOfDay.setHours(23, 59, 59, 999);

      // Activities
      let actQ = crmDb()
        .from("activities")
        .select("*")
        .eq("done", false)
        .lte("due_at", endOfDay.toISOString())
        .order("due_at", { ascending: true });
      if (!isManager && user) actQ = actQ.eq("owner_id", user.id);

      // Stale deals (active, not updated in 7+ days)
      let dealsQ = crmDb()
        .from("leads")
        .select("id, title, updated_at, accounts:account_id(name)")
        .in("stage", ["new", "qualified", "proposal", "negotiation", "closing"])
        .lte("updated_at", new Date(Date.now() - 7 * 86400000).toISOString())
        .order("updated_at", { ascending: true })
        .limit(5);
      if (!isManager && user) dealsQ = dealsQ.eq("owner_id", user.id);

      // Upcoming events from our view (30-day window)
      let eventsQ = crmDb()
        .from("contacts")
        .select("id, name, nickname, birth_date, account_id")
        .not("birth_date", "is", null);
      // Only fetch accounts that have at least one date field set
      let accountsQ = crmDb()
        .from("accounts")
        .select("id, name, founded_date, customer_since")
        .or("founded_date.not.is.null,customer_since.not.is.null");

      const [actRes, dealsRes, contactsRes, accRes] = await Promise.all([
        actQ, dealsQ, eventsQ, accountsQ,
      ]);

      // Split overdue vs today
      const acts = (actRes.data ?? []) as Activity[];
      setOverdueActs(acts.filter((a) => a.due_at && new Date(a.due_at) < startOfDay));
      setTodayActs(acts.filter((a) => a.due_at && new Date(a.due_at) >= startOfDay));

      // Stale deals
      setStaleDeals(
        (dealsRes.data ?? []).map((d: any) => ({
          id: d.id,
          title: d.title,
          days: Math.round((Date.now() - new Date(d.updated_at).getTime()) / 86400000),
          account: (d.accounts as any)?.name ?? "—",
        }))
      );

      // Upcoming events (30 days)
      const events: UpcomingEvent[] = [];
      for (const c of (contactsRes.data ?? []) as any[]) {
        const days = daysUntil(c.birth_date);
        if (days <= 30) {
          events.push({
            type: "birthday",
            label: c.nickname ?? c.name,
            accountId: c.account_id,
            contactId: c.id,
            days,
          });
        }
      }
      for (const a of (accRes.data ?? []) as any[]) {
        if (a.founded_date) {
          const days = daysUntil(a.founded_date);
          if (days <= 30) events.push({ type: "company_anniv", label: a.name, accountId: a.id, contactId: null, days });
        }
        if (a.customer_since) {
          const days = daysUntil(a.customer_since);
          if (days <= 30) events.push({ type: "customer_anniv", label: a.name, accountId: a.id, contactId: null, days });
        }
      }
      events.sort((a, b) => a.days - b.days);
      setUpcomingEvents(events);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id, isManager]);

  const totalAlerts = overdueActs.length + todayActs.length + upcomingEvents.length + staleDeals.length;

  return (
    <>
      {/* Panel */}
      <div className="border-b bg-background">
        {/* Toggle bar */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between px-6 py-2.5 hover:bg-muted/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">วันนี้ต้องทำ</span>
            {totalAlerts > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                {totalAlerts}
              </span>
            )}
            {overdueActs.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                <AlertTriangle className="h-3 w-3" /> {overdueActs.length} เลยกำหนด
              </span>
            )}
          </div>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {open && (
          <div className="grid grid-cols-1 gap-0 border-t md:grid-cols-4">

            {/* ── Overdue tasks ── */}
            <Section
              title="เลยกำหนด"
              icon={<AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
              count={overdueActs.length}
              empty="ไม่มีงานค้าง"
              accent="red"
              loading={loading}
            >
              {overdueActs.slice(0, 4).map((a) => {
                const Icon = activityIcon(a.type);
                return (
                  <ActivityItem
                    key={a.id}
                    a={a}
                    Icon={Icon}
                    urgent
                    onLog={() => { setLogLeadId(a.lead_id ?? null); setLogKind(a.type as ActivityKind); setLogOpen(true); }}
                  />
                );
              })}
              {overdueActs.length > 4 && (
                <Link to="/activities" search={{ filter: "overdue" } as any} className="block pt-1 text-center text-xs text-primary hover:underline">
                  ดูทั้งหมด {overdueActs.length} รายการ
                </Link>
              )}
            </Section>

            {/* ── Today's tasks ── */}
            <Section
              title="วันนี้"
              icon={<Clock className="h-3.5 w-3.5 text-amber-500" />}
              count={todayActs.length}
              empty="ไม่มีงานวันนี้ 🎉"
              accent="amber"
              loading={loading}
            >
              {todayActs.slice(0, 4).map((a) => {
                const Icon = activityIcon(a.type);
                return (
                  <ActivityItem
                    key={a.id}
                    a={a}
                    Icon={Icon}
                    onLog={() => { setLogLeadId(a.lead_id ?? null); setLogKind(a.type as ActivityKind); setLogOpen(true); }}
                  />
                );
              })}
              {todayActs.length > 4 && (
                <Link to="/activities" search={{ filter: "today" } as any} className="block pt-1 text-center text-xs text-primary hover:underline">
                  ดูทั้งหมด {todayActs.length} รายการ
                </Link>
              )}
            </Section>

            {/* ── Upcoming events ── */}
            <Section
              title="วันสำคัญ 30 วัน"
              icon={<Star className="h-3.5 w-3.5 text-amber-500" />}
              count={upcomingEvents.length}
              empty="ไม่มีวันสำคัญใน 30 วัน"
              loading={loading}
            >
              {upcomingEvents.slice(0, 5).map((ev, i) => {
                const Icon = ev.type === "birthday" ? Cake : ev.type === "company_anniv" ? CalendarDays : Star;
                const badge = ev.days === 0 ? "วันนี้ 🎉" : ev.days === 1 ? "พรุ่งนี้" : `อีก ${ev.days} วัน`;
                const badgeColor = ev.days === 0 ? "bg-red-100 text-red-700" : ev.days <= 7 ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700";
                const typeLabel = ev.type === "birthday" ? "วันเกิด" : ev.type === "company_anniv" ? "ครบรอบก่อตั้ง" : "ครบรอบลูกค้า";
                return (
                  <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/40">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{ev.label}</div>
                      <div className="text-[10px] text-muted-foreground">{typeLabel}</div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeColor}`}>
                      {badge}
                    </span>
                  </div>
                );
              })}
            </Section>

            {/* ── Stale deals ── */}
            <Section
              title="ดีลที่ไม่ได้แตะ"
              icon={<Clock className="h-3.5 w-3.5 text-muted-foreground" />}
              count={staleDeals.length}
              empty="ดีลทุกอันอัปเดตล่าสุดแล้ว"
              loading={loading}
            >
              {staleDeals.map((d) => (
                <Link
                  key={d.id}
                  to="/leads/$leadId"
                  params={{ leadId: d.id }}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{d.title}</div>
                    <div className="text-[10px] text-muted-foreground">{d.account}</div>
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{d.days} วัน</span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </Section>
          </div>
        )}
      </div>

      {/* Quick log dialog */}
      <ActivityLogDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        leadId={logLeadId}
        defaultKind={logKind}
        onSaved={() => { setLogOpen(false); load(); onRefresh?.(); }}
      />
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({
  title, icon, count, empty, accent, loading, children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  empty: string;
  accent?: string;
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="border-r last:border-r-0 p-3 min-w-0">
      <div className="mb-2 flex items-center gap-1.5">
        {icon}
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{title}</span>
        {count > 0 && (
          <span className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
            accent === "red"   ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300" :
            accent === "amber" ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" :
            "bg-muted text-muted-foreground"
          }`}>
            {count}
          </span>
        )}
      </div>
      {loading ? (
        <div className="py-3 text-center text-xs text-muted-foreground">กำลังโหลด…</div>
      ) : count === 0 ? (
        <div className="py-3 text-center text-xs text-muted-foreground">{empty}</div>
      ) : (
        <div className="space-y-0.5">{children}</div>
      )}
    </div>
  );
}

function ActivityItem({
  a, Icon, urgent, onLog,
}: {
  a: Activity;
  Icon: React.ElementType;
  urgent?: boolean;
  onLog: () => void;
}) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/40 ${
      urgent ? "border-l-2 border-l-red-400 pl-2.5" : ""
    }`}>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${urgent ? "text-red-500" : "text-muted-foreground"}`} />
      <div className="min-w-0 flex-1">
        <div className={`truncate text-xs font-medium ${urgent ? "text-red-700 dark:text-red-300" : ""}`}>
          {a.subject ?? a.type}
        </div>
        {a.due_at && (
          <div className={`text-[10px] ${urgent ? "font-semibold text-red-500" : "text-muted-foreground"}`}>
            {new Date(a.due_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onLog(); }}
        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10 transition-colors"
      >
        บันทึก
      </button>
    </div>
  );
}

// Icon for birthday (not in lucide top list)
function Cake({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/>
      <path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/>
      <path d="M2 21h20"/><path d="M7 8v3"/><path d="M12 8v3"/><path d="M17 8v3"/>
      <path d="M7 4 5 7"/><path d="M12 4v3"/><path d="M17 4l2 3"/>
    </svg>
  );
}
