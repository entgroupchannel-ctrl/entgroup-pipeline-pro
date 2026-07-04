import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Loader2, Search, Plus, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { crmDb, STAGE_LABEL_TH, ACTIVE_STAGES, OUTCOME_STAGES, type Lead, type LeadStage } from "@/lib/crm";
import { formatBaht, formatThaiDate } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { NewLeadDialog } from "@/components/pipeline/NewLeadDialog";

const searchSchema = z.object({
  stage: z.string().optional(),
  owner: z.string().optional(),
  q: z.string().optional(),
});

const ALL_STAGES: LeadStage[] = [...ACTIVE_STAGES, ...OUTCOME_STAGES];

const STAGE_COLOR: Record<LeadStage, string> = {
  new:          "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  qualified:    "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  proposal:     "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  negotiation:  "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  closing:      "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  won:          "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  lost:         "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

export const Route = createFileRoute("/_authenticated/leads")({
  validateSearch: searchSchema,
  component: LeadsPage,
});

function LeadsPage() {
  const { user, role } = useAuth();
  const isManager = role === "manager" || role === "admin";
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [accountsMap, setAccountsMap] = useState<Map<string, string>>(new Map());
  const [profilesMap, setProfilesMap] = useState<Map<string, { name: string; initials: string }>>(new Map());
  const [newOpen, setNewOpen] = useState(false);

  const stageFilter = (search.stage ?? "active") as LeadStage | "active" | "all";
  const ownerFilter = search.owner ?? "all";
  const qFilter = search.q ?? "";

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

  const filtered = useMemo(() => {
    if (!leads) return null;
    const needle = qFilter.trim().toLowerCase();
    return leads.filter((l) => {
      // stage filter
      if (stageFilter === "active" && !ACTIVE_STAGES.includes(l.stage)) return false;
      if (stageFilter !== "active" && stageFilter !== "all" && l.stage !== stageFilter) return false;
      // owner filter
      if (ownerFilter !== "all" && l.owner_id !== ownerFilter) return false;
      // search
      if (!needle) return true;
      return (
        l.title.toLowerCase().includes(needle) ||
        (l.account_id ? (accountsMap.get(l.account_id) ?? "").toLowerCase().includes(needle) : false) ||
        (l.source ?? "").toLowerCase().includes(needle)
      );
    });
  }, [leads, stageFilter, ownerFilter, qFilter, accountsMap]);

  // KPI summary
  const summary = useMemo(() => {
    if (!leads) return null;
    const active = leads.filter((l) => ACTIVE_STAGES.includes(l.stage));
    const won = leads.filter((l) => l.stage === "won");
    const pipeline = active.reduce((s, l) => s + (l.expected_value ?? 0), 0);
    const wonTotal = won.reduce((s, l) => s + (l.expected_value ?? 0), 0);
    return { activeCount: active.length, wonCount: won.length, pipeline, wonTotal };
  }, [leads]);

  const setSearch = (patch: Record<string, string | undefined>) =>
    navigate({ search: (prev: any) => ({ ...prev, ...patch }) as any });

  return (
    <div className="p-6 page-fade-in">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">รายการดีล</h1>
          <p className="text-xs text-muted-foreground">
            {filtered == null ? "กำลังโหลด…" : `${filtered.length} ดีล`}
          </p>
        </div>
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> ดีลใหม่
        </Button>
      </div>

      {/* KPI cards */}
      {summary && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="ดีล Active" value={String(summary.activeCount)} unit="ดีล" />
          <KpiCard label="Pipeline รวม" value={formatBaht(summary.pipeline)} />
          <KpiCard label="ชนะแล้ว" value={String(summary.wonCount)} unit="ดีล" highlight />
          <KpiCard label="มูลค่าชนะ" value={formatBaht(summary.wonTotal)} highlight />
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 w-56 pl-8 text-sm"
            placeholder="ค้นหาดีล / บริษัท"
            value={qFilter}
            onChange={(e) => setSearch({ q: e.target.value || undefined })}
          />
        </div>

        {/* stage pills */}
        <div className="flex flex-wrap gap-1">
          {([
            { key: "active", label: "Active" },
            { key: "all",    label: "ทั้งหมด" },
            ...ALL_STAGES.map((s) => ({ key: s, label: STAGE_LABEL_TH[s] })),
          ] as { key: string; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSearch({ stage: key === "active" ? undefined : key })}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                stageFilter === key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* owner filter (manager only) */}
        {isManager && (
          <Select value={ownerFilter} onValueChange={(v) => setSearch({ owner: v === "all" ? undefined : v })}>
            <SelectTrigger className="h-9 w-40 text-xs">
              <SelectValue placeholder="Sales ทั้งหมด" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Sales ทั้งหมด</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Table */}
      {filtered === null ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          <TrendingUp className="mx-auto mb-2 h-8 w-8 opacity-30" />
          ไม่พบดีลในหมวดนี้
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">ชื่อดีล</th>
                  <th className="px-4 py-2.5 text-left font-medium">บริษัท</th>
                  <th className="px-4 py-2.5 text-center font-medium">Stage</th>
                  <th className="px-4 py-2.5 text-right font-medium">มูลค่า</th>
                  <th className="px-4 py-2.5 text-left font-medium">ปิดคาดหวัง</th>
                  <th className="px-4 py-2.5 text-left font-medium">ที่มา</th>
                  <th className="px-4 py-2.5 text-left font-medium">Sales</th>
                  <th className="px-4 py-2.5 text-left font-medium">อัปเดต</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((l) => {
                  const owner = l.owner_id ? profilesMap.get(l.owner_id) : null;
                  const accountName = l.account_id ? accountsMap.get(l.account_id) : null;
                  const overdue =
                    l.expected_close_date &&
                    ACTIVE_STAGES.includes(l.stage) &&
                    new Date(l.expected_close_date).getTime() < Date.now();

                  return (
                    <tr key={l.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 max-w-[220px]">
                        <Link
                          to="/leads/$leadId"
                          params={{ leadId: l.id }}
                          className="truncate block font-medium text-primary hover:underline"
                        >
                          {l.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 max-w-[160px]">
                        <span className="truncate block text-xs text-muted-foreground">
                          {accountName ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STAGE_COLOR[l.stage]}`}>
                          {STAGE_LABEL_TH[l.stage]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {l.expected_value != null ? formatBaht(l.expected_value) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {l.expected_close_date ? (
                          <span className={overdue ? "font-medium text-red-600" : "text-muted-foreground"}>
                            {formatThaiDate(l.expected_close_date)}
                            {overdue ? " ⚠" : ""}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {l.source ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {owner ? (
                          <div className="flex items-center gap-1.5">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="bg-primary/10 text-[10px] text-primary">
                                {owner.initials}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs text-muted-foreground truncate max-w-[80px]">{owner.name}</span>
                          </div>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatThaiDate(l.updated_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <NewLeadDialog open={newOpen} onOpenChange={setNewOpen} onCreated={load} />
    </div>
  );
}

function KpiCard({ label, value, unit, highlight }: {
  label: string;
  value: string;
  unit?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20" : "bg-card"}`}>
      <div className={`text-xs font-medium ${highlight ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}>
        {label}
      </div>
      <div className={`mt-1 text-xl font-bold ${highlight ? "text-emerald-700 dark:text-emerald-300" : ""}`}>
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}
