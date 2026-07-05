import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Phone, Mail, MessageCircle, Users, FileText, AlertTriangle, CheckCircle2, Clock, Calendar } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";
import { activityIcon, formatThaiDate, ACTIVITY_TYPE_LABEL, ACTIVITY_TYPE_COLOR, type Activity, type ActivityType } from "@/lib/activities";
import { formatThaiDateTime } from "@/lib/format";
import { ListPagination, usePagination } from "@/components/list-pagination";
import { ActivityLogDialog, type ActivityKind } from "@/components/activities/ActivityLogDialog";

const searchSchema = z.object({
  filter: z.enum(["all", "overdue", "today", "pending", "done"]).optional(),
});

type FilterKey = "all" | "overdue" | "today" | "pending" | "done";

const FILTER_LABEL: Record<FilterKey, string> = {
  all: "ทั้งหมด",
  overdue: "เลยกำหนด",
  today: "วันนี้",
  pending: "รอดำเนินการ",
  done: "เสร็จแล้ว",
};

// ── Priority config ───────────────────────────────────────────────────────────

type PriorityLevel = "urgent" | "high" | "medium" | "low" | "none";

function getPriority(a: Activity): PriorityLevel {
  if (a.done) return "none";
  const now = Date.now();
  const due = a.due_at ? new Date(a.due_at).getTime() : null;
  if (!due) return "low";
  const hoursLeft = (due - now) / 3600000;
  if (hoursLeft < 0)    return "urgent"; // เลยกำหนด
  if (hoursLeft < 2)    return "urgent"; // ใน 2 ชั่วโมง
  if (hoursLeft < 24)   return "high";   // วันนี้
  if (hoursLeft < 72)   return "medium"; // 3 วัน
  return "low";
}

const PRIORITY_CONFIG: Record<PriorityLevel, {
  label: string;
  pillClass: string;
  rowClass: string;
  icon: React.ElementType | null;
}> = {
  urgent: {
    label: "เร่งด่วน",
    pillClass: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
    rowClass: "border-l-4 border-l-red-500 bg-red-50/30 dark:bg-red-950/10",
    icon: AlertTriangle,
  },
  high: {
    label: "วันนี้",
    pillClass: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    rowClass: "border-l-4 border-l-amber-400",
    icon: Clock,
  },
  medium: {
    label: "3 วัน",
    pillClass: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
    rowClass: "",
    icon: null,
  },
  low: {
    label: "",
    pillClass: "",
    rowClass: "",
    icon: null,
  },
  none: {
    label: "",
    pillClass: "",
    rowClass: "",
    icon: null,
  },
};

// ── Group activities by urgency section ────────────────────────────────────────

interface ActivityGroup {
  key: string;
  label: string;
  icon: React.ElementType | null;
  color: string;
  items: Activity[];
}

function groupActivities(items: Activity[]): ActivityGroup[] {
  const now = Date.now();
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
  const in3Days = endOfDay.getTime() + 2 * 86400000;

  const overdue: Activity[] = [];
  const today: Activity[] = [];
  const upcoming: Activity[] = [];
  const later: Activity[] = [];
  const done: Activity[] = [];
  const noDate: Activity[] = [];

  for (const a of items) {
    if (a.done) { done.push(a); continue; }
    if (!a.due_at) { noDate.push(a); continue; }
    const t = new Date(a.due_at).getTime();
    if (t < startOfDay.getTime())     overdue.push(a);
    else if (t <= endOfDay.getTime()) today.push(a);
    else if (t <= in3Days)            upcoming.push(a);
    else                              later.push(a);
  }

  const groups: ActivityGroup[] = [];
  if (overdue.length) groups.push({ key: "overdue", label: "เลยกำหนด", icon: AlertTriangle, color: "#E24B4A", items: overdue });
  if (today.length)   groups.push({ key: "today",   label: "วันนี้",    icon: Clock,          color: "#BA7517", items: today });
  if (upcoming.length)groups.push({ key: "upcoming",label: "3 วันข้างหน้า", icon: Calendar,  color: "#185FA5", items: upcoming });
  if (later.length)   groups.push({ key: "later",   label: "ถัดไป",     icon: null,           color: "#888780", items: later });
  if (noDate.length)  groups.push({ key: "nodate",  label: "ไม่มีกำหนด", icon: null,          color: "#888780", items: noDate });
  if (done.length)    groups.push({ key: "done",    label: "เสร็จแล้ว", icon: CheckCircle2,   color: "#639922", items: done });
  return groups;
}

export const Route = createFileRoute("/_authenticated/activities")({
  validateSearch: searchSchema,
  component: ActivitiesPage,
});

function ActivitiesPage() {
  const { user, role } = useAuth();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const filter: FilterKey = (search.filter as FilterKey) ?? "all";

  const [rows, setRows] = useState<Activity[] | null>(null);
  const [leadsMap, setLeadsMap] = useState<Map<string, { title: string }>>(new Map());
  const [profilesMap, setProfilesMap] = useState<Map<string, { full_name: string | null }>>(new Map());
  const [logOpen, setLogOpen] = useState(false);

  const isManager = role === "manager" || role === "admin";

  const load = async () => {
    let q = crmDb().from("activities").select("*").order("due_at", { ascending: true, nullsFirst: false });
    if (!isManager && user) q = q.eq("owner_id", user.id);
    const [actRes, leadsRes, profilesRes] = await Promise.all([
      q,
      crmDb().from("leads").select("id,title"),
      crmDb().from("user_profiles").select("id,full_name"),
    ]);
    if (actRes.error) return toast.error("โหลดกิจกรรมไม่สำเร็จ", { description: actRes.error.message });
    setRows((actRes.data ?? []) as Activity[]);
    setLeadsMap(new Map((leadsRes.data ?? []).map((l: any) => [l.id, { title: l.title }])));
    setProfilesMap(new Map((profilesRes.data ?? []).map((p: any) => [p.id, { full_name: p.full_name }])));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id, isManager]);

  const toggleDone = async (a: Activity, done: boolean) => {
    const { error } = await crmDb()
      .from("activities")
      .update({ done, done_at: done ? new Date().toISOString() : null })
      .eq("id", a.id);
    if (error) return toast.error("อัปเดตไม่สำเร็จ", { description: error.message });
    load();
  };

  const filtered = useMemo(() => {
    if (!rows) return null;
    const now = Date.now();
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
    switch (filter) {
      case "overdue":
        return rows.filter((a) => !a.done && a.due_at && new Date(a.due_at).getTime() < now);
      case "today":
        return rows.filter(
          (a) =>
            a.due_at &&
            new Date(a.due_at).getTime() >= startOfDay.getTime() &&
            new Date(a.due_at).getTime() <= endOfDay.getTime(),
        );
      case "pending": return rows.filter((a) => !a.done);
      case "done":    return rows.filter((a) => a.done);
      default:        return rows;
    }
  }, [rows, filter]);

  // Count badges for filter pills
  const counts = useMemo(() => {
    if (!rows) return {} as Record<FilterKey, number>;
    const now = Date.now();
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
    return {
      all:     rows.length,
      overdue: rows.filter((a) => !a.done && a.due_at && new Date(a.due_at).getTime() < now).length,
      today:   rows.filter((a) => a.due_at && new Date(a.due_at).getTime() >= startOfDay.getTime() && new Date(a.due_at).getTime() <= endOfDay.getTime()).length,
      pending: rows.filter((a) => !a.done).length,
      done:    rows.filter((a) => a.done).length,
    };
  }, [rows]);

  // When filter=all, use grouped view; otherwise flat paginated list
  const groups = useMemo(() => {
    if (filter !== "all" || !filtered) return null;
    return groupActivities(filtered);
  }, [filter, filtered]);

  const { page, setPage, pageSize, setPageSize, totalPages, total: pagedTotal, paged: pageItems } =
    usePagination(filter !== "all" ? (filtered ?? []) : [], 25);

  const pendingCount = counts["pending"] ?? 0;
  const overdueCount = counts["overdue"] ?? 0;

  return (
    <div className="p-6 page-fade-in">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">กิจกรรม</h1>
          <p className="text-xs text-muted-foreground">
            {pendingCount > 0 && <span className="text-amber-600 font-medium">{pendingCount} รายการรอ</span>}
            {overdueCount > 0 && <span className="ml-2 text-red-600 font-medium">· {overdueCount} เลยกำหนด</span>}
          </p>
        </div>
        <Button size="sm" onClick={() => setLogOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> บันทึกกิจกรรม
        </Button>
      </div>

      {/* Filter pills with count badges */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(FILTER_LABEL) as FilterKey[]).map((k) => {
          const cnt = counts[k] ?? 0;
          const isOverdueFilter = k === "overdue";
          return (
            <button
              key={k}
              onClick={() => navigate({ search: { filter: k === "all" ? undefined : k } as any })}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                filter === k
                  ? "border-primary bg-primary text-primary-foreground"
                  : isOverdueFilter && cnt > 0
                  ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-red-950/30 dark:text-red-300"
                  : "bg-background hover:bg-muted"
              }`}
            >
              {FILTER_LABEL[k]}
              {cnt > 0 && k !== "all" && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  filter === k
                    ? "bg-white/20 text-inherit"
                    : isOverdueFilter && cnt > 0
                    ? "bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-100"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {cnt}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {filtered === null ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          ไม่มีกิจกรรมในหมวดนี้
        </div>
      ) : filter === "all" && groups ? (
        // Grouped view
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.key}>
              <div className="mb-2 flex items-center gap-2">
                {group.icon && <group.icon className="h-3.5 w-3.5 shrink-0" style={{ color: group.color }} />}
                <span className="text-xs font-semibold" style={{ color: group.color }}>
                  {group.label}
                </span>
                <span className="text-xs text-muted-foreground">({group.items.length})</span>
              </div>
              <ul className="divide-y rounded-xl border bg-card overflow-hidden">
                {group.items.map((a) => (
                  <ActivityRow
                    key={a.id}
                    a={a}
                    leadsMap={leadsMap}
                    profilesMap={profilesMap}
                    onToggle={toggleDone}
                    onNavigate={(leadId) => navigate({ to: "/leads/$leadId", params: { leadId } })}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        // Flat list view (filtered)
        <>
          <ul className="divide-y rounded-xl border bg-card overflow-hidden">
            {pageItems.map((a) => (
              <ActivityRow
                key={a.id}
                a={a}
                leadsMap={leadsMap}
                profilesMap={profilesMap}
                onToggle={toggleDone}
                onNavigate={(leadId) => navigate({ to: "/leads/$leadId", params: { leadId } })}
              />
            ))}
          </ul>
          {filtered.length > 0 && (
            <div className="mt-3 rounded-xl border bg-card overflow-hidden">
              <ListPagination
                page={page} pageSize={pageSize} total={pagedTotal} totalPages={totalPages}
                onPageChange={setPage} onPageSizeChange={setPageSize} className="border-t-0"
              />
            </div>
          )}
        </>
      )}

      {/* Global add dialog (no leadId — user can link manually) */}
      <ActivityLogDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        leadId={null}
        onSaved={() => { setLogOpen(false); load(); }}
      />
    </div>
  );
}

// ── Activity Row ──────────────────────────────────────────────────────────────

function ActivityRow({
  a, leadsMap, profilesMap, onToggle, onNavigate,
}: {
  a: Activity;
  leadsMap: Map<string, { title: string }>;
  profilesMap: Map<string, { full_name: string | null }>;
  onToggle: (a: Activity, done: boolean) => void;
  onNavigate: (leadId: string) => void;
}) {
  const Icon = activityIcon(a.type);
  const priority = getPriority(a);
  const pCfg = PRIORITY_CONFIG[priority];
  const lead = a.lead_id ? leadsMap.get(a.lead_id) : null;
  const owner = a.owner_id ? profilesMap.get(a.owner_id) : null;
  const initials = (owner?.full_name ?? "?")
    .split(" ").map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  // Parse JSON body for rich notes preview
  let bodyPreview = "";
  if (a.body) {
    try {
      const parsed = JSON.parse(a.body);
      const parts: string[] = [];
      if (parsed.issues)       parts.push(parsed.issues);
      if (parsed.next_action)  parts.push(`→ ${parsed.next_action}`);
      if (parsed.topic)        parts.push(parsed.topic);
      bodyPreview = parts[0] ?? "";
    } catch {
      bodyPreview = a.body;
    }
  }

  const typeCfg = ACTIVITY_TYPE_COLOR[a.type] ?? ACTIVITY_TYPE_COLOR["note"];

  return (
    <li
      className={`flex items-center gap-3 px-4 py-3 transition-colors ${pCfg.rowClass} ${
        a.lead_id ? "cursor-pointer hover:bg-muted/40" : ""
      } ${a.done ? "opacity-60" : ""}`}
      onClick={() => { if (a.lead_id) onNavigate(a.lead_id); }}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={a.done} onCheckedChange={(v) => onToggle(a, !!v)} />
      </div>

      {/* Type badge (icon + label) */}
      <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${typeCfg.bg} ${typeCfg.text}`}>
        <Icon className={`h-3 w-3 ${typeCfg.icon}`} />
        {ACTIVITY_TYPE_LABEL[a.type as ActivityType] ?? a.type}
      </span>

      {/* Main content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium ${a.done ? "line-through text-muted-foreground" : ""}`}>
            {a.subject ?? ACTIVITY_TYPE_LABEL[a.type as ActivityType] ?? a.type}
          </span>
          {/* Priority badge */}
          {pCfg.label && !a.done && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${pCfg.pillClass}`}>
              {pCfg.icon && <pCfg.icon className="h-2.5 w-2.5" />}
              {pCfg.label}
            </span>
          )}
        </div>
        {/* Lead title */}
        {lead && a.lead_id && (
          <div className="truncate text-xs text-primary mt-0.5">{lead.title}</div>
        )}
        {/* Body preview with tooltip */}
        {bodyPreview && !a.done && (
          <div
            className="truncate text-xs text-muted-foreground mt-0.5 italic max-w-xs cursor-default"
            title={bodyPreview}
          >
            {bodyPreview}
          </div>
        )}
      </div>

      {/* Due date + time */}
      <div className={`shrink-0 text-xs ${
        priority === "urgent" ? "font-semibold text-red-600" :
        priority === "high"   ? "font-medium text-amber-600" :
        "text-muted-foreground"
      }`}>
        {a.due_at ? formatThaiDateTime(a.due_at) : "—"}
      </div>

      {/* Owner avatar */}
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarFallback className="bg-primary/10 text-[10px] text-primary">{initials || "?"}</AvatarFallback>
      </Avatar>
    </li>
  );
}
