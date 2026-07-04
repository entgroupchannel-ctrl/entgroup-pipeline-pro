import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Loader2, TrendingUp, Trophy, Clock, CalendarPlus, Phone, Mail, MessageCircle, StickyNote, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { th } from "date-fns/locale";
import { crmDb, ACTIVE_STAGES, OUTCOME_STAGES, STAGE_LABEL_TH, type LeadStage } from "@/lib/crm";
import { formatBaht } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { Skeleton } from "@/components/ui/skeleton";
import { MonthlyKpiSection } from "@/components/kpi/MonthlyKpiSection";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { role } = useAuth();
  if (role && role !== "manager" && role !== "admin") {
    return <Navigate to="/pipeline" />;
  }
  return <Dashboard />;
}

interface DashData {
  leads: any[];
  profiles: Record<string, { id: string; full_name: string | null; role: string }>;
  activities: any[];
}

function Dashboard() {
  const [data, setData] = useState<DashData | null>(null);

  useEffect(() => {
    (async () => {
      const [leadsRes, profilesRes, activitiesRes] = await Promise.all([
        crmDb().from("leads").select("*"),
        crmDb().from("user_profiles").select("id,full_name,role"),
        crmDb().from("activities").select("*").order("created_at", { ascending: false }).limit(10),
      ]);
      const profMap: Record<string, any> = {};
      (profilesRes.data ?? []).forEach((p: any) => { profMap[p.id] = p; });
      setData({
        leads: leadsRes.data ?? [],
        profiles: profMap,
        activities: activitiesRes.data ?? [],
      });
    })();
  }, []);

  const now = new Date();
  const monthStart = useMemo(() => new Date(now.getFullYear(), now.getMonth(), 1), []);

  const perOwner = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, any>();
    for (const l of data.leads) {
      const oid = l.owner_id ?? "unassigned";
      if (!map.has(oid)) {
        map.set(oid, { owner_id: oid, active: 0, active_value: 0, won_this_month: 0, won_total: 0, lost_total: 0 });
      }
      const rec = map.get(oid);
      if (ACTIVE_STAGES.includes(l.stage)) {
        rec.active += 1;
        rec.active_value += Number(l.expected_value ?? 0);
      }
      if (l.stage === "won") {
        rec.won_total += 1;
        if (l.actual_close_date && new Date(l.actual_close_date) >= monthStart) rec.won_this_month += 1;
      }
      if (l.stage === "lost") rec.lost_total += 1;
    }
    return Array.from(map.values());
  }, [data, monthStart]);

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { leads, profiles, activities } = data;
  const activeLeads = leads.filter((l) => ACTIVE_STAGES.includes(l.stage));
  const wonLeads = leads.filter((l) => l.stage === "won");
  const lostLeads = leads.filter((l) => l.stage === "lost");
  const closedCount = wonLeads.length + lostLeads.length;

  const pipelineValue = activeLeads.reduce((s, l) => s + Number(l.expected_value ?? 0), 0);
  const winRate = closedCount ? (wonLeads.length / closedCount) * 100 : 0;

  const cycleDays = wonLeads
    .filter((l) => l.created_at && l.actual_close_date)
    .map((l) => (new Date(l.actual_close_date).getTime() - new Date(l.created_at).getTime()) / 86400000);
  const avgCycle = cycleDays.length ? cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length : 0;

  const dealsThisMonth = leads.filter((l) => new Date(l.created_at) >= monthStart).length;

  const stageData = [...ACTIVE_STAGES, ...OUTCOME_STAGES].map((s) => ({
    stage: STAGE_LABEL_TH[s],
    key: s,
    value: leads.filter((l) => l.stage === s).reduce((sum, l) => sum + Number(l.expected_value ?? 0), 0),
  }));


  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-xs text-muted-foreground">ภาพรวมยอดขายและ Pipeline</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Pipeline Value" value={formatBaht(pipelineValue)} icon={<TrendingUp className="h-5 w-5" />} tone="primary" />
        <KpiCard label="Win Rate" value={`${winRate.toFixed(0)}%`} sub={`${wonLeads.length}/${closedCount} ปิดดีล`} icon={<Trophy className="h-5 w-5" />} tone="emerald" />
        <KpiCard label="Avg. Deal Cycle" value={`${avgCycle.toFixed(0)} วัน`} sub="ตั้งแต่สร้างจนปิดชนะ" icon={<Clock className="h-5 w-5" />} tone="amber" />
        <KpiCard label="Deals This Month" value={String(dealsThisMonth)} sub="ดีลใหม่เดือนนี้" icon={<CalendarPlus className="h-5 w-5" />} tone="indigo" />
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold">Pipeline by Stage</h2>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={stageData} layout="vertical" margin={{ left: 20, right: 20 }}>
              <XAxis type="number" tickFormatter={(v) => new Intl.NumberFormat("th-TH", { notation: "compact" }).format(v)} className="text-xs" />
              <YAxis dataKey="stage" type="category" width={90} className="text-xs" />
              <Tooltip formatter={(v: any) => formatBaht(Number(v))} cursor={{ fill: "hsl(var(--muted))" }} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {stageData.map((d) => (
                  <Cell key={d.key} className={`stage-fill-${d.key}`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 xl:col-span-2">
          <h2 className="mb-4 text-sm font-semibold">Sales Performance</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">พนักงานขาย</th>
                  <th className="pb-2 pr-4 font-medium">ดีลใน pipeline</th>
                  <th className="pb-2 pr-4 font-medium">มูลค่ารวม</th>
                  <th className="pb-2 pr-4 font-medium">ชนะเดือนนี้</th>
                  <th className="pb-2 font-medium">Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {perOwner.length === 0 ? (
                  <tr><td colSpan={5} className="py-6 text-center text-xs text-muted-foreground">ยังไม่มีข้อมูล</td></tr>
                ) : perOwner.map((r) => {
                  const closed = r.won_total + r.lost_total;
                  const wr = closed ? (r.won_total / closed) * 100 : 0;
                  const name = r.owner_id === "unassigned" ? "ยังไม่มอบหมาย" : (profiles[r.owner_id]?.full_name ?? "—");
                  return (
                    <tr key={r.owner_id} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-medium">{name}</td>
                      <td className="py-3 pr-4">{r.active}</td>
                      <td className="py-3 pr-4">{formatBaht(r.active_value)}</td>
                      <td className="py-3 pr-4">{r.won_this_month}</td>
                      <td className="py-3">{wr.toFixed(0)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Recent Activities</h2>
          <ul className="space-y-3">
            {activities.length === 0 && <li className="text-xs text-muted-foreground">ยังไม่มีกิจกรรม</li>}
            {activities.map((a) => {
              const lead = leads.find((l) => l.id === a.lead_id);
              const owner = a.owner_id ? profiles[a.owner_id]?.full_name : null;
              return (
                <li key={a.id} className="flex items-start gap-3">
                  <ActivityIcon type={a.type} done={a.done} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{a.subject ?? a.type}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {lead?.title ?? "-"} {owner ? `· ${owner}` : ""}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: th })}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      {/* ── Monthly KPI Targets ── */}
      <div className="rounded-xl border bg-card p-5">
        <MonthlyKpiSection />
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, icon, tone }: { label: string; value: string; sub?: string; icon: React.ReactNode; tone: "primary" | "emerald" | "amber" | "indigo" }) {
  const toneMap = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  }[tone];
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneMap}`}>{icon}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _preventTreeShake = Skeleton;
