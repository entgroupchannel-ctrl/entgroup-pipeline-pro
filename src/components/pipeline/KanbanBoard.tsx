import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Plus, Inbox, FileDown, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { crmDb, ACTIVE_STAGES, OUTCOME_STAGES, STAGE_LABEL_TH, type Lead, type LeadStage, type Account } from "@/lib/crm";
import { formatBaht } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { KanbanCard } from "./KanbanCard";
import { NewLeadDialog } from "./NewLeadDialog";
import { FAImportModal } from "@/components/flowaccount/FAImportModal";
import { fetchFALastSync } from "@/lib/flowaccount-client";
import { formatThaiDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RefreshCw } from "lucide-react";
import { useLineRealtime } from "@/hooks/useLineRealtime";

import type { Activity } from "@/lib/activities";

interface LeadWithRelations extends Lead {
  account?: Account | null;
  owner?: { id: string; full_name: string | null } | null;
  nextActivity?: Activity | null;
}

interface KanbanBoardProps {
  sourceFilter?: "all" | "line";
  showClaimButton?: boolean;
}

export function KanbanBoard({ sourceFilter = "all", showClaimButton = false }: KanbanBoardProps = {}) {
  const { user } = useAuth();
  const [leads, setLeads] = useState<LeadWithRelations[]>([]);
  const [linePreviews, setLinePreviews] = useState<Record<string, string>>({});
  const [lineSubFilter, setLineSubFilter] = useState<"all" | "unclaimed" | "mine">("all");
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const navigate = useNavigate();
  const confirm = useConfirm();
  const openLead = (id: string) => navigate({ to: "/leads/$leadId", params: { leadId: id } });
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [overdueCount, setOverdueCount] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const refreshSync = () => fetchFALastSync().then(setLastSync).catch(() => {});
  const { unreadCounts, latestMessage, clearBadge } = useLineRealtime();


  useEffect(() => {
    if (!latestMessage) return;
    toast(`💬 LINE: ${latestMessage.display_name}`, {
      description: latestMessage.message.slice(0, 80),
      duration: 5000,
    });
  }, [latestMessage]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const deleteLead = async (id: string) => {
    const _ok = await confirm({ title: "ลบดีลนี้?", variant: "danger" });
    if (!_ok) return;
    const { error } = await crmDb().from("leads").delete().eq("id", id);
    if (error) { toast.error("ลบไม่สำเร็จ"); return; }
    toast.success("ลบแล้ว"); loadLeads();
  };

  const duplicateLead = async (lead: LeadWithRelations) => {
    const { error } = await crmDb().from("leads").insert({
      title: `${lead.title} (สำเนา)`, stage: "new",
      expected_value: lead.expected_value, account_id: lead.account_id,
      contact_id: lead.contact_id, source: lead.source, owner_id: lead.owner_id,
      created_by: user?.id,
    });
    if (error) { toast.error("สร้างซ้ำไม่สำเร็จ"); return; }
    toast.success("สร้างซ้ำแล้ว"); loadLeads();
  };

  const loadLeads = async () => {
    const [leadsRes, accountsRes, profilesRes] = await Promise.all([
      crmDb().from("leads").select("*").order("updated_at", { ascending: false }),
      crmDb().from("accounts").select("id,name,industry"),
      crmDb().from("user_profiles").select("id,full_name,role"),
    ]);
    if (leadsRes.error) {
      toast.error("โหลดข้อมูลไม่สำเร็จ", { description: leadsRes.error.message });
      setLoading(false);
      return;
    }
    const leadIds = (leadsRes.data ?? []).map((l: any) => l.id);
    const actsRes = leadIds.length
      ? await crmDb()
          .from("activities")
          .select("*")
          .in("lead_id", leadIds)
          .eq("done", false)
          .order("due_at", { ascending: true, nullsFirst: false })
      : { data: [] as Activity[] };
    const nextByLead = new Map<string, Activity>();
    for (const a of (actsRes.data ?? []) as Activity[]) {
      if (a.lead_id && !nextByLead.has(a.lead_id)) nextByLead.set(a.lead_id, a);
    }
    const accountsMap = new Map((accountsRes.data ?? []).map((a: any) => [a.id, a]));
    const profilesMap = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]));
    const merged = (leadsRes.data ?? []).map((l: any) => ({
      ...l,
      account: l.account_id ? accountsMap.get(l.account_id) ?? null : null,
      owner: l.owner_id ? profilesMap.get(l.owner_id) ?? null : null,
      nextActivity: nextByLead.get(l.id) ?? null,
    }));
    setLeads(merged as LeadWithRelations[]);
    setLoading(false);
  };

  useEffect(() => {
    loadLeads();
    refreshSync();

    const channel = supabase
      .channel("crm-leads-board")
      .on("postgres_changes", { event: "*", schema: "crm", table: "leads" }, () => {
        loadLeads();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { count } = await crmDb()
        .from("activities")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id)
        .eq("done", false)
        .lt("due_at", new Date().toISOString());
      setOverdueCount(count ?? 0);
    })();
  }, [user, leads.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setNewLeadOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const totalPipeline = useMemo(
    () => leads.filter((l) => ACTIVE_STAGES.includes(l.stage as LeadStage))
               .reduce((s, l) => s + Number(l.expected_value ?? 0), 0),
    [leads],
  );

  const grouped = useMemo(() => {
    const g: Record<LeadStage, LeadWithRelations[]> = {
      new: [], qualified: [], proposal: [], negotiation: [], closing: [], won: [], lost: [],
    };
    for (const l of leads) {
      const s = (l.stage as LeadStage) ?? "new";
      if (g[s]) g[s].push(l);
    }
    return g;
  }, [leads]);

  const active = activeId ? leads.find((l) => l.id === activeId) : null;

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const leadId = String(active.id);
    const newStage = String(over.id) as LeadStage;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stage === newStage) return;
    if (!ACTIVE_STAGES.includes(newStage)) return;

    const prevStage = lead.stage;
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, stage: newStage } : l)));

    const { error } = await crmDb().from("leads").update({ stage: newStage }).eq("id", leadId);
    if (error) {
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, stage: prevStage } : l)));
      toast.error("ย้ายดีลไม่สำเร็จ", { description: error.message });
    } else {
      toast.success(`ย้ายไป "${STAGE_LABEL_TH[newStage]}" แล้ว`);
    }
  };

  return (
    <div className="flex h-full flex-col page-fade-in">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b bg-background px-6 py-4 sm:flex sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Pipeline</h1>
          <p className="text-xs text-muted-foreground">ลาก-วาง หรือกด <kbd className="rounded border bg-muted px-1 text-[10px]">N</kbd> เพื่อเพิ่มดีลใหม่</p>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>Last synced: {lastSync ? formatThaiDate(lastSync) : "—"}</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={refreshSync}
                    className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted"
                  >
                    <RefreshCw className="h-3 w-3" /> Refresh
                  </button>
                </TooltipTrigger>
                <TooltipContent>ข้อมูลอัปเดตจาก floworder.me อัตโนมัติ</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <FileDown className="mr-1 h-4 w-4" /> Import จาก FlowAccount
          </Button>
          <Button onClick={() => setNewLeadOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> เพิ่มดีลใหม่
          </Button>
        </div>
      </div>

      {overdueCount > 0 && (
        <div className="flex items-center justify-between gap-3 border-b bg-amber-50 px-6 py-3 dark:bg-amber-950/30">
          <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
            <AlertCircle className="h-4 w-4" />
            <span>⚠ คุณมี <span className="font-semibold">{overdueCount}</span> รายการที่เลยกำหนด</span>
          </div>
          <Link
            to="/activities"
            search={{ filter: "overdue" } as any}
            className="text-sm font-medium text-amber-900 hover:underline dark:text-amber-100"
          >
            ดูทั้งหมด →
          </Link>
        </div>
      )}

      <div className="flex-1 overflow-x-auto p-6">

        <DndContext
          sensors={sensors}
          onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="flex min-w-max gap-4 pb-4">
            {ACTIVE_STAGES.map((stage) => (
              <Column
                key={stage}
                stage={stage}
                leads={grouped[stage]}
                loading={loading}
                onCardClick={openLead}
                activeId={activeId}
                totalPipeline={totalPipeline}
                onDelete={deleteLead}
                onDuplicate={duplicateLead}
                lineUnreadCounts={unreadCounts}
                onLineBadgeClear={clearBadge}
              />
            ))}
          </div>

          <DragOverlay>
            {active ? (
              <div className="w-72 rotate-2 opacity-90">
                <KanbanCard lead={active} onClick={() => {}} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {OUTCOME_STAGES.map((stage) => {
            const list = grouped[stage];
            const sum = list.reduce((s, l) => s + Number(l.expected_value ?? 0), 0);
            const isWon = stage === "won";
            return (
              <div
                key={stage}
                className={`rounded-xl border-2 p-4 ${
                  isWon
                    ? "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20"
                    : "border-red-200 bg-red-50/50 dark:bg-red-950/20"
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${isWon ? "bg-emerald-500" : "bg-red-500"}`}
                    />
                    <span className="font-semibold">{STAGE_LABEL_TH[stage]}</span>
                    <span className="text-sm text-muted-foreground">({list.length})</span>
                  </div>
                  <span className="text-sm font-medium">{formatBaht(sum)}</span>
                </div>
                <div className="space-y-2">
                  {list.slice(0, 3).map((l) => (
                    <button
                      key={l.id}
                      onClick={() => openLead(l.id)}
                      className="w-full rounded-md bg-background/70 px-3 py-2 text-left text-sm hover:bg-background"
                    >
                      <div className="truncate font-medium">{l.title}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {l.account?.name ?? "-"} · {formatBaht(Number(l.expected_value ?? 0))}
                      </div>
                    </button>
                  ))}
                  {list.length === 0 && (
                    <p className="py-2 text-center text-xs text-muted-foreground">ยังไม่มีดีล</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      
      <NewLeadDialog open={newLeadOpen} onOpenChange={setNewLeadOpen} onCreated={loadLeads} />
      <FAImportModal open={importOpen} onOpenChange={setImportOpen} onImported={() => { loadLeads(); refreshSync(); }} />
    </div>
  );
}

function Column({
  stage,
  leads,
  loading,
  onCardClick,
  activeId,
  totalPipeline,
  onDelete,
  onDuplicate,
  lineUnreadCounts,
  onLineBadgeClear,
}: {
  stage: LeadStage;
  leads: LeadWithRelations[];
  loading: boolean;
  onCardClick: (id: string) => void;
  activeId: string | null;
  totalPipeline: number;
  onDelete: (id: string) => void;
  onDuplicate: (lead: LeadWithRelations) => void;
  lineUnreadCounts?: Record<string, number>;
  onLineBadgeClear?: (leadId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;

  const sum = leads.reduce((s, l) => s + Number(l.expected_value ?? 0), 0);

  // Sort: priority desc → expected_close_date asc → value desc
  const sorted = [...leads].sort((a, b) => {
    const pa = (a as any).priority ?? 0;
    const pb = (b as any).priority ?? 0;
    if (pb !== pa) return pb - pa;
    const da = a.expected_close_date ?? "9999";
    const db = b.expected_close_date ?? "9999";
    if (da !== db) return da < db ? -1 : 1;
    return Number(b.expected_value ?? 0) - Number(a.expected_value ?? 0);
  });

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageLeads  = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page when leads list changes (e.g. after drag)
  const leadsKey = leads.map(l => l.id).join(",");
  const prevKeyRef = { current: leadsKey };
  if (prevKeyRef.current !== leadsKey && page > 0) setPage(0);

  // Priority breakdown for progress bar
  const high   = leads.filter((l) => ((l as any).priority ?? 0) >= 3).reduce((s, l) => s + Number(l.expected_value ?? 0), 0);
  const medium = leads.filter((l) => ((l as any).priority ?? 0) === 2).reduce((s, l) => s + Number(l.expected_value ?? 0), 0);
  const low    = leads.filter((l) => ((l as any).priority ?? 0) === 1).reduce((s, l) => s + Number(l.expected_value ?? 0), 0);
  const none   = sum - high - medium - low;
  const pct = (v: number) => totalPipeline > 0 ? Math.max(0, Math.min(100, (v / totalPipeline) * 100)) : 0;

  return (
    <div className="flex w-72 shrink-0 flex-col">
      {/* Column header */}
      <div className="mb-1 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full stage-dot-${stage}`} />
          <span className="text-sm font-semibold">{STAGE_LABEL_TH[stage]}</span>
          <span className="text-xs text-muted-foreground">({leads.length})</span>
        </div>
        <span className="text-xs font-semibold tabular-nums">{formatBaht(sum)}</span>
      </div>

      {/* Progress bar */}
      <div className="mb-3 flex h-1.5 w-full overflow-hidden rounded-full bg-muted/50 px-1">
        {high   > 0 && <div style={{ width: `${pct(high)}%`   }} className="bg-emerald-500 transition-all" />}
        {medium > 0 && <div style={{ width: `${pct(medium)}%` }} className="bg-amber-400 transition-all" />}
        {low    > 0 && <div style={{ width: `${pct(low)}%`    }} className="bg-sky-400 transition-all" />}
        {none   > 0 && <div style={{ width: `${pct(none)}%`   }} className="bg-slate-300 dark:bg-slate-600 transition-all" />}
      </div>

      {/* Cards area */}
      <div
        ref={setNodeRef}
        className={`flex flex-col gap-2 rounded-xl border bg-muted/40 p-2 transition-colors ${
          isOver ? "border-primary/60 bg-primary/5" : ""
        }`}
        style={{ minHeight: "calc(100vh - 18rem)" }}
      >
        {loading ? (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </>
        ) : leads.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
            <Inbox className="h-6 w-6" />
            <span className="text-xs">ยังไม่มีดีลในขั้นนี้</span>
          </div>
        ) : (
          <>
            {pageLeads.map((l) => (
              <div key={l.id} className={activeId === l.id ? "opacity-30" : ""}>
                <KanbanCard
                  lead={l}
                  onClick={() => onCardClick(l.id)}
                  draggable
                  onDelete={() => onDelete(l.id)}
                  onDuplicate={() => onDuplicate(l)}
                  lineUnread={lineUnreadCounts?.[l.id] ?? 0}
                  onLineBadgeClear={() => onLineBadgeClear?.(l.id)}
                />
              </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-1 flex items-center justify-between border-t border-border/50 pt-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-xs text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ‹
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setPage(i)}
                      className={`h-1.5 rounded-full transition-all ${
                        i === page
                          ? "w-4 bg-primary"
                          : "w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground/70"
                      }`}
                    />
                  ))}
                </div>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-xs text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ›
                </button>
              </div>
            )}

            {/* Page info */}
            {totalPages > 1 && (
              <div className="text-center text-[10px] text-muted-foreground">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, leads.length)} จาก {leads.length}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
