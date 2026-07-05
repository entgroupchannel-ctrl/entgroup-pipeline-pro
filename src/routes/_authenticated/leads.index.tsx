import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  Loader2, Search, Plus, TrendingUp, Calendar, ChevronLeft, ChevronRight,
  BarChart2, Trophy, AlertTriangle, DollarSign, FileText, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { crmDb, STAGE_LABEL_TH, ACTIVE_STAGES, OUTCOME_STAGES, type Lead, type LeadStage } from "@/lib/crm";
import { formatBaht, formatThaiDate } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { NewLeadDialog } from "@/components/pipeline/NewLeadDialog";
import { RowActions, stdOpen, stdDupe, stdDelete } from "@/components/ui/row-actions";
import { exportToCsv, leadsToRows } from "@/lib/export-csv";
import { usePermissions } from "@/lib/permissions";
import { ListPagination, usePagination } from "@/components/list-pagination";

// ── Types & constants ─────────────────────────────────────────────────────────

const searchSchema = z.object({
  stage: z.string().optional(),
  owner: z.string().optional(),
  q: z.string().optional(),
  period: z.string().optional(),   // all | month | quarter | year
  py: z.string().optional(),       // year (number string)
  pm: z.string().optional(),       // month 1-12
  pq: z.string().optional(),       // quarter 1-4
});

type PeriodMode = "all" | "month" | "quarter" | "year";

const ALL_STAGES: LeadStage[] = [...ACTIVE_STAGES, ...OUTCOME_STAGES];

const MONTH_TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const QUARTER_MONTHS: Record<number, [number, number]> = { 1:[1,3], 2:[4,6], 3:[7,9], 4:[10,12] };

export const Route = createFileRoute("/_authenticated/leads/")({
  validateSearch: searchSchema,
  component: LeadsPage,
});

// ── Period helpers ─────────────────────────────────────────────────────────────

function periodRange(mode: PeriodMode, year: number, month: number, quarter: number): [Date, Date] | null {
  if (mode === "all") return null;
  if (mode === "month") {
    return [new Date(year, month - 1, 1), new Date(year, month, 1)];
  }
  if (mode === "quarter") {
    const [m1, m2] = QUARTER_MONTHS[quarter];
    return [new Date(year, m1 - 1, 1), new Date(year, m2, 1)];
  }
  if (mode === "year") {
    return [new Date(year, 0, 1), new Date(year + 1, 0, 1)];
  }
  return null;
}

function periodLabel(mode: PeriodMode, year: number, month: number, quarter: number): string {
  if (mode === "all")     return "ทั้งหมด";
  if (mode === "month")   return `${MONTH_TH[month - 1]} ${year + 543}`;
  if (mode === "quarter") return `Q${quarter}/${year + 543}`;
  if (mode === "year")    return `ปี ${year + 543}`;
  return "";
}

// ── Page ──────────────────────────────────────────────────────────────────────

function LeadsPage() {
  const { user, role } = useAuth();
  const confirm = useConfirm();
  const isManager = role === "manager" || role === "admin";
  const { can } = usePermissions();
  const canCreate  = can("lead.create");
  const canDelete  = can("lead.delete");
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const now = new Date();
  const [leads, setLeads]           = useState<Lead[] | null>(null);
  const [accountsMap, setAccountsMap] = useState<Map<string, string>>(new Map());
  const [profilesMap, setProfilesMap] = useState<Map<string, { name: string; initials: string }>>(new Map());
  const [newOpen, setNewOpen]       = useState(false);

  // ── period state ────────────────────────────────────────────────────────────
  const mode    = (search.period ?? "all") as PeriodMode;
  const year    = parseInt(search.py  ?? String(now.getFullYear()));
  const month   = parseInt(search.pm  ?? String(now.getMonth() + 1));
  const quarter = parseInt(search.pq  ?? String(Math.ceil((now.getMonth() + 1) / 3)));

  const stageFilter = (search.stage ?? "active") as LeadStage | "active" | "all";
  const ownerFilter = search.owner ?? "all";
  const qFilter     = search.q ?? "";

  const setSearch = (patch: Record<string, string | undefined>) =>
    navigate({ search: (prev: any) => ({ ...prev, ...patch }) as any });

  // ── period navigation ───────────────────────────────────────────────────────
  const prevPeriod = () => {
    if (mode === "month") {
      if (month === 1) setSearch({ py: String(year - 1), pm: "12" });
      else setSearch({ pm: String(month - 1) });
    } else if (mode === "quarter") {
      if (quarter === 1) setSearch({ py: String(year - 1), pq: "4" });
      else setSearch({ pq: String(quarter - 1) });
    } else if (mode === "year") {
      setSearch({ py: String(year - 1) });
    }
  };
  const nextPeriod = () => {
    if (mode === "month") {
      if (month === 12) setSearch({ py: String(year + 1), pm: "1" });
      else setSearch({ pm: String(month + 1) });
    } else if (mode === "quarter") {
      if (quarter === 4) setSearch({ py: String(year + 1), pq: "1" });
      else setSearch({ pq: String(quarter + 1) });
    } else if (mode === "year") {
      setSearch({ py: String(year + 1) });
    }
  };

  // ── load ────────────────────────────────────────────────────────────────────
  const load = async () => {
    let qb = crmDb().from("leads").select("*").order("updated_at", { ascending: false });
    if (!isManager && user) qb = qb.eq("owner_id", user.id);
    const [leadsRes, accRes, profRes] = await Promise.all([
      qb,
      crmDb().from("accounts").select("id,name"),
      crmDb().from("user_profiles").select("id,full_name"),
    ]);
    if (leadsRes.error) return toast.error("โหลดดีลไม่สำเร็จ", { description: leadsRes.error.message });
    setLeads((leadsRes.data ?? []) as Lead[]);
    setAccountsMap(new Map((accRes.data ?? []).map((a: any) => [a.id, a.name])));
    setProfilesMap(new Map((profRes.data ?? []).map((p: any) => {
      const name = p.full_name ?? "?";
      const initials = name.split(" ").map((s: string) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
      return [p.id, { name, initials }];
    })));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id, isManager]);

  const profiles = useMemo(() => Array.from(profilesMap.entries()).map(([id, v]) => ({ id, ...v })), [profilesMap]);

  // ── period filter ───────────────────────────────────────────────────────────
  const range = periodRange(mode, year, month, quarter);
  const periodLeads = useMemo(() => {
    if (!leads) return null;
    if (!range) return leads;
    const [start, end] = range;
    return leads.filter((l) => {
      const dateStr = l.expected_close_date ?? l.created_at;
      const d = new Date(dateStr);
      return d >= start && d < end;
    });
  }, [leads, range]);

  // ── stage + owner + text filter ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!periodLeads) return null;
    const needle = qFilter.trim().toLowerCase();
    return periodLeads.filter((l) => {
      if (stageFilter === "active" && !ACTIVE_STAGES.includes(l.stage)) return false;
      if (stageFilter !== "active" && stageFilter !== "all" && l.stage !== stageFilter) return false;
      if (ownerFilter !== "all" && l.owner_id !== ownerFilter) return false;
      if (!needle) return true;
      const dealText = ((l as any).deal_number ?? l.title ?? "").toLowerCase();
      const accountName = l.account_id ? (accountsMap.get(l.account_id) ?? "").toLowerCase() : "";
      return dealText.includes(needle) || accountName.includes(needle);
    });
  }, [periodLeads, stageFilter, ownerFilter, qFilter, accountsMap]);

  const {
    page, setPage, pageSize, setPageSize, totalPages,
    total: pagedTotal, paged: pageItems,
  } = usePagination(filtered ?? [], 25);

  // ── period KPIs ─────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const src = periodLeads ?? [];
    const won  = src.filter(l => l.stage === "won");
    const lost = src.filter(l => l.stage === "lost");
    const active = src.filter(l => ACTIVE_STAGES.includes(l.stage));
    const pipeline    = active.reduce((s, l) => s + Number(l.expected_value ?? 0), 0);
    const wonRevenue  = won.reduce((s, l)  => s + Number(l.expected_value ?? 0), 0);
    const lostValue   = lost.reduce((s, l) => s + Number(l.expected_value ?? 0), 0);
    const total = won.length + lost.length;
    const winRate = total > 0 ? Math.round((won.length / total) * 100) : null;
    return { pipeline, wonRevenue, lostValue, wonCount: won.length, lostCount: lost.length, activeCount: active.length, totalCount: src.length, winRate };
  }, [periodLeads]);

  const duplicateLead = async (l: Lead) => {
    const { error } = await crmDb().from("leads").insert({
      title: l.title && l.title !== (l as any).deal_number ? `${l.title} (สำเนา)` : null, stage: "new",
      expected_value: l.expected_value, expected_close_date: l.expected_close_date,
      account_id: l.account_id, source: l.source, owner_id: l.owner_id, created_by: user?.id,
    });
    if (error) { toast.error("สร้างซ้ำไม่สำเร็จ"); return; }
    toast.success("สร้างซ้ำแล้ว"); load();
  };

  const deleteLead = async (id: string) => {
    const _ok = await confirm({ title: "ลบดีลนี้?", variant: "danger" });
    if (!_ok) return;
    const { error } = await crmDb().from("leads").delete().eq("id", id);
    if (error) { toast.error("ลบไม่สำเร็จ"); return; }
    toast.success("ลบแล้ว"); load();
  };

  const handleExport = () => {
    // Sales: export only own leads (filtered already scoped by owner_id from query)
    // Manager/Admin: export all visible
    if (!filtered?.length) { toast.error("ไม่มีข้อมูลที่จะ export"); return; }
    const rows = leadsToRows(filtered, accountsMap, profilesMap, STAGE_LABEL_TH);
    const period = mode !== "all" ? `-${periodLabel(mode, year, month, quarter)}` : "";
    exportToCsv(`leads${period}-${new Date().toISOString().slice(0,10)}.csv`, rows);
    toast.success(`Export ${filtered.length} รายการแล้ว`);
  };

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col page-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b bg-background">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            รายการดีล
            {filtered != null && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
                {filtered.length}
              </span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {filtered == null ? "กำลังโหลด…" : `${filtered.length} ดีล`}
            {mode !== "all" && ` · ${periodLabel(mode, year, month, quarter)}`}
          </p>
        </div>
      </div>


      {/* ── Content ── */}
      <div className="flex-1 overflow-auto p-6 space-y-5">

        {/* ── Period selector ── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border bg-muted/30 p-0.5 gap-0.5">
            {([
              { key: "all",     label: "ทั้งหมด", icon: <BarChart2 className="h-3.5 w-3.5" /> },
              { key: "month",   label: "รายเดือน", icon: <Calendar className="h-3.5 w-3.5" /> },
              { key: "quarter", label: "รายไตรมาส", icon: <Calendar className="h-3.5 w-3.5" /> },
              { key: "year",    label: "รายปี",     icon: <TrendingUp className="h-3.5 w-3.5" /> },
            ] as { key: PeriodMode; label: string; icon: React.ReactNode }[]).map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setSearch({ period: key === "all" ? undefined : key })}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  mode === key
                    ? "bg-background shadow-sm text-foreground border border-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {icon} {label}
              </button>
            ))}
          </div>

          {mode !== "all" && (
            <div className="flex items-center gap-1 rounded-md border bg-background px-2 py-1">
              <button onClick={prevPeriod} className="rounded p-0.5 hover:bg-muted">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[96px] text-center text-sm font-medium">
                {periodLabel(mode, year, month, quarter)}
              </span>
              <button onClick={nextPeriod} className="rounded p-0.5 hover:bg-muted">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {mode === "year" && (
            <Select value={String(year)} onValueChange={(v) => setSearch({ py: v })}>
              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[-2, -1, 0, 1].map(o => {
                  const y = now.getFullYear() + o;
                  return <SelectItem key={y} value={String(y)}>{y + 543}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          )}

          {mode === "quarter" && (
            <Select value={String(quarter)} onValueChange={(v) => setSearch({ pq: v })}>
              <SelectTrigger className="h-8 w-20 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1,2,3,4].map(q => <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* ── Period KPI bar (neutral) ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <PeriodKpiCard icon={<BarChart2 className="h-4 w-4" />} label="ดีลทั้งหมด"   value={String(kpi.totalCount)}      unit="ดีล" />
          <PeriodKpiCard icon={<TrendingUp className="h-4 w-4" />} label="Active"       value={String(kpi.activeCount)}    unit="ดีล" />
          <PeriodKpiCard icon={<DollarSign className="h-4 w-4" />} label="Pipeline"     value={formatBaht(kpi.pipeline)} />
          <PeriodKpiCard icon={<Trophy className="h-4 w-4" />}     label="ชนะ"          value={formatBaht(kpi.wonRevenue)} unit={`(${kpi.wonCount} ดีล)`} />
          <PeriodKpiCard icon={<AlertTriangle className="h-4 w-4" />} label="แพ้"       value={formatBaht(kpi.lostValue)}  unit={`(${kpi.lostCount} ดีล)`} />
          <PeriodKpiCard icon={<FileText className="h-4 w-4" />}     label="Win Rate"
            value={kpi.winRate != null ? `${kpi.winRate}%` : "—"} />
        </div>

        {/* ── Filters ── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 w-64 pl-8 text-xs"
              placeholder="ค้นหาดีล / บริษัท"
              value={qFilter}
              onChange={(e) => setSearch({ q: e.target.value || undefined })}
            />
          </div>

          <Select value={stageFilter} onValueChange={(v) => setSearch({ stage: v === "active" ? undefined : v })}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="all">ทั้งหมด</SelectItem>
              {ALL_STAGES.map(s => <SelectItem key={s} value={s}>{STAGE_LABEL_TH[s]}</SelectItem>)}
            </SelectContent>
          </Select>

          {isManager && (
            <Select value={ownerFilter} onValueChange={(v) => setSearch({ owner: v === "all" ? undefined : v })}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Sales ทั้งหมด" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Sales ทั้งหมด</SelectItem>
                {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          <Button variant="outline" size="sm" className="h-8" onClick={handleExport} disabled={!filtered?.length}
            title={!isManager ? "Export เฉพาะดีลของคุณ" : "Export CSV ทั้งหมด"}>
            <ArrowRight className="mr-1.5 h-3.5 w-3.5 rotate-90" />
            {isManager ? "Export CSV" : "Export ดีลของฉัน"}
          </Button>
          {canCreate && (
            <Button size="sm" className="h-8" onClick={() => setNewOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> ดีลใหม่
            </Button>
          )}
        </div>

      {/* ── Table ── */}

      {filtered === null ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          <TrendingUp className="mx-auto mb-2 h-8 w-8 opacity-30" />
          ไม่พบดีลในช่วงนี้
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium w-28">วันที่</th>
                  <th className="px-4 py-3 text-left font-medium">เลขที่ดีล</th>
                  <th className="px-4 py-3 text-left font-medium">บริษัท</th>
                  <th className="px-4 py-3 text-right font-medium">มูลค่า</th>
                  <th className="px-4 py-3 text-left font-medium w-32">สถานะ</th>
                  <th className="px-3 py-3 text-right w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pageItems.map((l) => {
                  const accountName = l.account_id  ? accountsMap.get(l.account_id) : null;
                  const dealNumber = (l as any).deal_number as string | undefined;
                  const note = l.title && l.title !== dealNumber ? l.title : null;
                  const overdue = l.expected_close_date && ACTIVE_STAGES.includes(l.stage) &&
                    new Date(l.expected_close_date).getTime() < Date.now();

                  return (
                    <tr
                      key={l.id}
                      className="group hover:bg-muted/40 transition-colors cursor-pointer"
                      onClick={() => navigate({ to: "/leads/$leadId", params: { leadId: l.id } })}
                    >
                      <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                        {formatThaiDate(l.created_at)}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium text-foreground">{dealNumber ?? l.title}</span>
                          {l.source && l.source !== "" && (
                            <span className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                              l.source === "b2b"        ? "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" :
                              l.source === "line_oa"    ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300" :
                              l.source === "flowaccount" ? "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300" :
                              l.source === "referral"   ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" :
                              l.source === "website"    ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300" :
                              "bg-muted text-muted-foreground"
                            }`}>
                              {l.source === "b2b" ? "🛒 B2B" :
                               l.source === "line_oa" ? "💬 LINE" :
                               l.source === "flowaccount" ? "FA" :
                               l.source === "referral" ? "แนะนำ" :
                               l.source === "website" ? "Web" :
                               l.source}
                            </span>
                          )}
                        </div>
                        {note && (
                          <span className="block text-xs text-muted-foreground truncate max-w-[260px] mt-0.5">{note}</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-foreground">
                        <span className="truncate block max-w-[220px]">{accountName ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm font-medium tabular-nums whitespace-nowrap">
                        {l.expected_value != null ? formatBaht(l.expected_value) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3.5 w-32">
                        <span className={`inline-flex items-center text-xs ${
                          l.stage === "won" ? "text-emerald-600" :
                          l.stage === "lost" ? "text-red-600" :
                          overdue ? "text-red-600 font-medium" : "text-muted-foreground"
                        }`}>
                          {STAGE_LABEL_TH[l.stage]}
                          {overdue && l.stage !== "lost" && l.stage !== "won" && " (เลยกำหนด)"}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <RowActions actions={[
                          stdOpen(() => navigate({ to: "/leads/$leadId", params: { leadId: l.id } })),
                          stdDupe(() => duplicateLead(l)),
                          ...(canDelete ? [stdDelete(() => deleteLead(l.id))] : []),
                        ]} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ListPagination
            page={page}
            pageSize={pageSize}
            total={pagedTotal}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        คลิกแถวเพื่อดูรายละเอียดดีล
      </p>

      </div>

      <NewLeadDialog open={newOpen} onOpenChange={setNewOpen} onCreated={load} />
    </div>
  );
}

// ── Period KPI card ───────────────────────────────────────────────────────────

function PeriodKpiCard({ icon, label, value, unit }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1.5 text-lg font-bold tabular-nums text-foreground">{value}</div>
      {unit && <div className="text-[11px] text-muted-foreground">{unit}</div>}
    </div>
  );
}
