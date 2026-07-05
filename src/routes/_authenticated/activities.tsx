import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";
import { activityIcon, formatThaiDate, ACTIVITY_TYPE_LABEL, type Activity, type ActivityType } from "@/lib/activities";
import { ListPagination, usePagination } from "@/components/list-pagination";

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
      case "pending":
        return rows.filter((a) => !a.done);
      case "done":
        return rows.filter((a) => a.done);
      default:
        return rows;
    }
  }, [rows, filter]);

  const {
    page, setPage, pageSize, setPageSize, totalPages,
    total: pagedTotal, paged: pageItems,
  } = usePagination(filtered ?? [], 25);

  return (
    <div className="p-6 page-fade-in">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">กิจกรรม</h1>
        <p className="text-xs text-muted-foreground">รายการติดตามและงานที่ต้องทำ</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(FILTER_LABEL) as FilterKey[]).map((k) => (
          <button
            key={k}
            onClick={() => navigate({ search: { filter: k === "all" ? undefined : k } as any })}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              filter === k ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
            }`}
          >
            {FILTER_LABEL[k]}
          </button>
        ))}
      </div>

      {filtered === null ? (
        <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          ไม่มีกิจกรรมในหมวดนี้
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {filtered.map((a) => {
            const Icon = activityIcon(a.type);
            const overdue = !a.done && !!a.due_at && new Date(a.due_at).getTime() < Date.now();
            const lead = a.lead_id ? leadsMap.get(a.lead_id) : null;
            const owner = a.owner_id ? profilesMap.get(a.owner_id) : null;
            const initials = (owner?.full_name ?? "?")
              .split(" ").map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
            return (
              <li
                key={a.id}
                className={`flex items-center gap-3 px-4 py-3 ${overdue ? "border-l-4 border-l-red-500" : ""} ${a.done ? "opacity-60" : ""} ${a.lead_id ? "cursor-pointer hover:bg-muted/40" : ""} transition-colors`}
                onClick={() => { if (a.lead_id) navigate({ to: "/leads/$leadId", params: { leadId: a.lead_id } }); }}
              >
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={a.done} onCheckedChange={(v) => toggleDone(a, !!v)} />
                </div>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-medium ${a.done ? "line-through" : ""}`}>
                    {a.subject ?? ACTIVITY_TYPE_LABEL[a.type as ActivityType] ?? a.type}
                  </div>
                  {lead && a.lead_id && (
                    <span className="truncate text-xs text-primary">
                      {lead.title}
                    </span>
                  )}
                </div>
                <div className={`shrink-0 text-xs ${overdue ? "font-medium text-red-600" : "text-muted-foreground"}`}>
                  {a.due_at ? formatThaiDate(a.due_at) : "-"}
                </div>
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-[10px] text-primary">{initials || "?"}</AvatarFallback>
                </Avatar>
              </li>
            );
          })}
        </ul>
      )}

      
    </div>
  );
}
