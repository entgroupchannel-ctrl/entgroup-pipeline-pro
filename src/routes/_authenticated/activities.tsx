import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2, Plus, AlertTriangle, CheckCircle2, Clock,
  Calendar, ChevronDown, ChevronRight, Search,
} from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";
import {
  activityIcon, ACTIVITY_TYPE_LABEL, ACTIVITY_TYPE_COLOR,
  type Activity, type ActivityType,
} from "@/lib/activities";
import { ActivityLogDialog } from "@/components/activities/ActivityLogDialog";

export const Route = createFileRoute("/_authenticated/activities")({
  component: ActivitiesPage,
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS_TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const DAYS_TH = ["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัส","ศุกร์","เสาร์"];

function todayTH(): string {
  const d = new Date();
  return `${DAYS_TH[d.getDay()]}ที่ ${d.getDate()} ${MONTHS_TH[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function formatDue(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setHours(0,0,0,0);
  const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfYesterday.getDate()-1);
  const startOfTomorrow = new Date(startOfToday); startOfTomorrow.setDate(startOfTomorrow.getDate()+1);

  const hh = d.getHours().toString().padStart(2,"0");
  const mm = d.getMinutes().toString().padStart(2,"0");
  const time = `${hh}:${mm}`;

  if (d >= startOfToday && d < startOfTomorrow) return time; // today — time only
  if (d >= startOfYesterday && d < startOfToday) return `เมื่อวาน ${time}`;
  if (d < startOfYesterday) {
    const daysAgo = Math.floor((startOfToday.getTime() - d.getTime()) / 86400000);
    if (daysAgo === 1) return `เมื่อวาน ${time}`;
    if (daysAgo < 7) return `${daysAgo} วันที่แล้ว`;
    return `${d.getDate()} ${MONTHS_TH[d.getMonth()]}`;
  }
  // future
  if (d >= startOfTomorrow && d < new Date(startOfTomorrow.getTime()+86400000)) return `พรุ่งนี้ ${time}`;
  return `${d.getDate()} ${MONTHS_TH[d.getMonth()]}`;
}

// ── Group logic ───────────────────────────────────────────────────────────────

interface Group {
  key: string;
  label: string;
  icon: React.ElementType | null;
  color: string;
  borderColor: string;
  bgColor: string;
  items: Activity[];
  collapsible?: boolean;
}

function buildGroups(items: Activity[]): Group[] {
  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setHours(0,0,0,0);
  const endOfToday = new Date(now); endOfToday.setHours(23,59,59,999);
  const in3Days = new Date(endOfToday); in3Days.setDate(in3Days.getDate()+3);

  const overdue:  Activity[] = [];
  const today:    Activity[] = [];
  const upcoming: Activity[] = [];
  const later:    Activity[] = [];
  const noDate:   Activity[] = [];
  const done:     Activity[] = [];

  for (const a of items) {
    if (a.done) { done.push(a); continue; }
    if (!a.due_at) { noDate.push(a); continue; }
    const t = new Date(a.due_at);
    if (t < startOfToday)      overdue.push(a);
    else if (t <= endOfToday)  today.push(a);
    else if (t <= in3Days)     upcoming.push(a);
    else                       later.push(a);
  }

  const groups: Group[] = [];
  if (overdue.length)  groups.push({ key:"overdue",  label:"เลยกำหนด",      icon:AlertTriangle, color:"#A32D2D", borderColor:"border-red-500",    bgColor:"bg-red-50/40 dark:bg-red-950/10",    items:overdue });
  if (today.length)    groups.push({ key:"today",    label:"วันนี้",          icon:Clock,         color:"#854F0B", borderColor:"border-amber-400",  bgColor:"",                                   items:today });
  if (upcoming.length) groups.push({ key:"upcoming", label:"3 วันข้างหน้า",  icon:Calendar,      color:"#0C447C", borderColor:"border-blue-400",   bgColor:"",                                   items:upcoming });
  if (later.length)    groups.push({ key:"later",    label:"ถัดไป",           icon:null,          color:"#5F5E5A", borderColor:"border-gray-300",   bgColor:"",                                   items:later });
  if (noDate.length)   groups.push({ key:"nodate",   label:"ไม่มีกำหนด",     icon:null,          color:"#5F5E5A", borderColor:"border-gray-300",   bgColor:"",                                   items:noDate });
  if (done.length)     groups.push({ key:"done",     label:"เสร็จแล้ว",       icon:CheckCircle2,  color:"#3B6D11", borderColor:"border-emerald-400",bgColor:"",                                   items:done, collapsible:true });
  return groups;
}

// ── Main page ─────────────────────────────────────────────────────────────────

function ActivitiesPage() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const isManager = role === "manager" || role === "admin";

  const [rows, setRows]           = useState<Activity[] | null>(null);
  const [leadsMap, setLeadsMap]   = useState<Map<string, string>>(new Map());
  const [profilesMap, setProfilesMap] = useState<Map<string, string>>(new Map());
  const [logOpen, setLogOpen]     = useState(false);
  const [search, setSearch]       = useState("");
  const [doneOpen, setDoneOpen]   = useState(false);

  const load = async () => {
    let q = crmDb().from("activities").select("*").order("due_at", { ascending: true, nullsFirst: false });
    if (!isManager && user) q = q.eq("owner_id", user.id);
    const [actRes, leadsRes, profRes] = await Promise.all([
      q,
      crmDb().from("leads").select("id,title"),
      crmDb().from("user_profiles").select("id,full_name"),
    ]);
    if (actRes.error) { toast.error("โหลดกิจกรรมไม่สำเร็จ"); return; }
    setRows((actRes.data ?? []) as Activity[]);
    setLeadsMap(new Map((leadsRes.data ?? []).map((l: any) => [l.id, l.title])));
    setProfilesMap(new Map((profRes.data ?? []).map((p: any) => [p.id, p.full_name ?? "?"])));
  };

  useEffect(() => { load(); }, [user?.id, isManager]);

  const toggleDone = async (a: Activity, done: boolean) => {
    // Optimistic update
    setRows((prev) => prev?.map((r) => r.id === a.id ? { ...r, done, done_at: done ? new Date().toISOString() : null } : r) ?? null);
    const { error } = await crmDb().from("activities").update({ done, done_at: done ? new Date().toISOString() : null }).eq("id", a.id);
    if (error) {
      toast.error("อัปเดตไม่สำเร็จ");
      setRows((prev) => prev?.map((r) => r.id === a.id ? { ...r, done: !done } : r) ?? null);
    } else {
      if (done) toast.success("เสร็จแล้ว ✓", { duration: 1500 });
    }
  };

  const filtered = useMemo(() => {
    if (!rows) return null;
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((a) =>
      (a.subject ?? "").toLowerCase().includes(q) ||
      (a.lead_id ? (leadsMap.get(a.lead_id) ?? "") : "").toLowerCase().includes(q)
    );
  }, [rows, search, leadsMap]);

  const groups = useMemo(() => filtered ? buildGroups(filtered) : [], [filtered]);

  const counts = useMemo(() => {
    if (!rows) return { overdue: 0, today: 0, upcoming: 0, done: 0, pending: 0 };
    const now = new Date();
    const startOfToday = new Date(now); startOfToday.setHours(0,0,0,0);
    const endOfToday = new Date(now); endOfToday.setHours(23,59,59,999);
    const in3Days = new Date(endOfToday); in3Days.setDate(in3Days.getDate()+3);
    return {
      overdue:  rows.filter((a) => !a.done && a.due_at && new Date(a.due_at) < startOfToday).length,
      today:    rows.filter((a) => !a.done && a.due_at && new Date(a.due_at) >= startOfToday && new Date(a.due_at) <= endOfToday).length,
      upcoming: rows.filter((a) => !a.done && a.due_at && new Date(a.due_at) > endOfToday && new Date(a.due_at) <= in3Days).length,
      done:     rows.filter((a) => a.done).length,
      pending:  rows.filter((a) => !a.done).length,
    };
  }, [rows]);

  if (filtered === null) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex h-full flex-col page-fade-in">

      {/* ── Header ── */}
      <div className="border-b bg-background px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">งานวันนี้</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{todayTH()}</p>
          </div>
          <Button size="sm" onClick={() => setLogOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> บันทึกกิจกรรม
          </Button>
        </div>

        {/* KPI stat cards */}
        <div className="mt-4 grid grid-cols-4 gap-2">
          <StatCard value={counts.overdue}  label="เลยกำหนด"       color="text-red-600 dark:text-red-400"     bg="bg-red-50 dark:bg-red-950/20"     border="border-red-200 dark:border-red-800" />
          <StatCard value={counts.today}    label="วันนี้"           color="text-amber-700 dark:text-amber-400" bg="bg-amber-50 dark:bg-amber-950/20"  border="border-amber-200 dark:border-amber-800" />
          <StatCard value={counts.upcoming} label="3 วันข้างหน้า"   color="text-blue-700 dark:text-blue-400"  bg="bg-blue-50 dark:bg-blue-950/20"    border="border-blue-200 dark:border-blue-800" />
          <StatCard value={counts.done}     label="เสร็จแล้ว"       color="text-emerald-700 dark:text-emerald-400" bg="bg-emerald-50 dark:bg-emerald-950/20" border="border-emerald-200 dark:border-emerald-800" />
        </div>

        {/* Search */}
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="ค้นหากิจกรรม หรือชื่อดีล..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mb-3 opacity-20" />
            <p className="text-sm font-medium">ไม่มีงานค้าง</p>
            <p className="text-xs mt-1 opacity-60">ทุกอย่างเสร็จเรียบร้อย 🎉</p>
          </div>
        ) : (
          <div className="divide-y">
            {groups.map((group) => {
              const isCollapsible = group.collapsible;
              const isOpen = isCollapsible ? doneOpen : true;
              const SHOW_MAX = 3;

              return (
                <div key={group.key}>
                  {/* Section header */}
                  <button
                    className={`flex w-full items-center gap-2 px-6 py-2.5 text-left transition-colors hover:bg-muted/30 ${isCollapsible ? "cursor-pointer" : ""}`}
                    onClick={() => isCollapsible && setDoneOpen((v) => !v)}
                  >
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: group.color }} />
                    {group.icon && <group.icon className="h-3.5 w-3.5 shrink-0" style={{ color: group.color }} />}
                    <span className="text-xs font-semibold" style={{ color: group.color }}>
                      {group.label}
                    </span>
                    <span className="text-xs text-muted-foreground">({group.items.length})</span>
                    {isCollapsible && (
                      <span className="ml-auto">
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                      </span>
                    )}
                  </button>

                  {/* Task rows */}
                  {isOpen && (
                    <ActivityGroupRows
                      group={group}
                      leadsMap={leadsMap}
                      profilesMap={profilesMap}
                      onToggle={toggleDone}
                      onNavigate={(leadId) => navigate({ to: "/leads/$leadId", params: { leadId } })}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ActivityLogDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        leadId={null}
        onSaved={() => { setLogOpen(false); load(); }}
      />
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ value, label, color, bg, border }: {
  value: number; label: string; color: string; bg: string; border: string;
}) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 text-center ${bg} ${border}`}>
      <div className={`text-2xl font-bold leading-none ${value > 0 ? color : "text-muted-foreground"}`}>
        {value}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

// ── Task rows for a group ─────────────────────────────────────────────────────

function ActivityGroupRows({ group, leadsMap, profilesMap, onToggle, onNavigate }: {
  group: Group;
  leadsMap: Map<string, string>;
  profilesMap: Map<string, string>;
  onToggle: (a: Activity, done: boolean) => void;
  onNavigate: (leadId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const SHOW_MAX = group.key === "done" ? 3 : 5;
  const visible = showAll ? group.items : group.items.slice(0, SHOW_MAX);
  const hidden = group.items.length - visible.length;

  return (
    <div>
      <ul className={`divide-y border-t ${group.bgColor}`}>
        {visible.map((a) => (
          <TaskRow
            key={a.id}
            a={a}
            group={group}
            leadsMap={leadsMap}
            profilesMap={profilesMap}
            onToggle={onToggle}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
      {hidden > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="flex w-full items-center justify-center gap-1.5 border-t py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
          style={{ color: group.color }}
        >
          <ChevronDown className="h-3.5 w-3.5" />
          ดูอีก {hidden} รายการ
        </button>
      )}
    </div>
  );
}

// ── Task row ──────────────────────────────────────────────────────────────────

function TaskRow({ a, group, leadsMap, profilesMap, onToggle, onNavigate }: {
  a: Activity;
  group: Group;
  leadsMap: Map<string, string>;
  profilesMap: Map<string, string>;
  onToggle: (a: Activity, done: boolean) => void;
  onNavigate: (leadId: string) => void;
}) {
  const Icon = activityIcon(a.type);
  const typeCfg = ACTIVITY_TYPE_COLOR[a.type] ?? ACTIVITY_TYPE_COLOR["note"];
  const leadTitle = a.lead_id ? leadsMap.get(a.lead_id) : null;
  const ownerName = a.owner_id ? profilesMap.get(a.owner_id) : null;
  const initials = (ownerName ?? "?").split(" ").map((s: string) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  const isOverdue = group.key === "overdue";
  const isToday   = group.key === "today";
  const isDone    = a.done;

  // Due label color
  const dueColor = isOverdue ? "text-red-600 dark:text-red-400 font-semibold" :
                   isToday   ? "text-amber-700 dark:text-amber-400" :
                               "text-muted-foreground";

  return (
    <li
      className={`flex items-center gap-3 px-6 py-3 transition-colors ${
        a.lead_id ? "cursor-pointer hover:bg-muted/40" : "hover:bg-muted/20"
      } ${isDone ? "opacity-50" : ""}`}
      style={!isDone && (isOverdue || isToday) ? { borderLeft: `3px solid ${isOverdue ? "#E24B4A" : "#BA7517"}` } : {}}
      onClick={() => { if (a.lead_id) onNavigate(a.lead_id); }}
    >
      {/* Checkbox */}
      <div onClick={(e) => e.stopPropagation()} className="shrink-0">
        <Checkbox checked={isDone} onCheckedChange={(v) => onToggle(a, !!v)} />
      </div>

      {/* Type pill */}
      <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${typeCfg.bg} ${typeCfg.text}`}>
        <Icon className={`h-3 w-3 ${typeCfg.icon}`} />
        {ACTIVITY_TYPE_LABEL[a.type as ActivityType] ?? a.type}
      </span>

      {/* Main content */}
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium leading-snug ${isDone ? "line-through text-muted-foreground" : ""}`}>
          {a.subject ?? ACTIVITY_TYPE_LABEL[a.type as ActivityType]}
        </p>
        {leadTitle && (
          <p className="mt-0.5 truncate text-xs text-primary/80">{leadTitle}</p>
        )}
      </div>

      {/* Due time */}
      {a.due_at && !isDone && (
        <span className={`shrink-0 text-xs ${dueColor}`}>
          {formatDue(a.due_at)}
        </span>
      )}
      {isDone && a.done_at && (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          เสร็จ {formatDue(a.done_at)}
        </span>
      )}

      {/* Owner avatar */}
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
          {initials}
        </AvatarFallback>
      </Avatar>
    </li>
  );
}
