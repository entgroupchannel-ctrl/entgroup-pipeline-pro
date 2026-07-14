import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/pipeline/KanbanBoard";
import { ActivityLogDialog, type ActivityKind } from "@/components/activities/ActivityLogDialog";
import { crmDb } from "@/lib/crm";
import { fetchUnmatchedQuotes } from "@/lib/b2b-client";
import { B2BRequestsTab } from "@/components/pipeline/B2BRequestsTab";
import { LineRequestsTab } from "@/components/pipeline/LineRequestsTab";
import { B2BConversationTab } from "@/components/pipeline/B2BConversationTab";
import { supabase } from "@/integrations/supabase/client";


export const Route = createFileRoute("/_authenticated/pipeline")({
  component: PipelinePage,
});

function PipelinePage() {
  const [tab, setTab] = useState<"all" | "line" | "b2b" | "messages">("all");
  const [msgUnread, setMsgUnread] = useState({ b2b: 0, web: 0, general: 0 });
  const totalMsgUnread = msgUnread.b2b + msgUnread.web + msgUnread.general;
  const [b2bCount, setB2bCount] = useState(0);
  const [unassignedLine, setUnassignedLine] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  // Quick-log dialog state — triggered from KanbanCard buttons
  const [logOpen, setLogOpen] = useState(false);
  const [logLeadId, setLogLeadId] = useState<string | null>(null);
  const [logKind, setLogKind] = useState<ActivityKind>("call");

  const loadCount = async () => {
    const { count } = await crmDb()
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("source", "line")
      .is("owner_id", null);
    setUnassignedLine(count ?? 0);
  };

  useEffect(() => {
    loadCount();
    const ch = supabase
      .channel("pipeline-line-count")
      .on("postgres_changes", { event: "*", schema: "crm", table: "leads" }, () => loadCount())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Poll unread counts every 30s — b2b-live-chat returns unread_count per session
  useEffect(() => {
    const LC = "https://ugzdwmyylqmirrljtuej.supabase.co/functions/v1/b2b-live-chat";
    const SK = "entgroup-crm-secret-2026";
    const poll = async () => {
      try {
        const [wb, ww, wg] = await Promise.all([
          fetch(`${LC}?action=b2b`, { headers: { "x-crm-secret": SK } }).then(r=>r.json()),
          fetch(`${LC}?action=web`, { headers: { "x-crm-secret": SK } }).then(r=>r.json()),
          fetch(`${LC}?action=general`, { headers: { "x-crm-secret": SK } }).then(r=>r.json()),
        ]);
        const sumUnread = (d: any[]) => d.reduce((s: number, c: any) => s + (c.unread_count ?? 0), 0);
        setMsgUnread({
          b2b:     sumUnread(wb?.data  ?? []),
          web:     sumUnread(ww?.data  ?? []),
          general: sumUnread(wg?.data  ?? []),
        });
      } catch { /* silent */ }
    };
    poll();
    const t = setInterval(poll, 30_000);
    return () => clearInterval(t);
  }, []);

  const handleQuickLog = (leadId: string, type: ActivityKind) => {
    setLogLeadId(leadId);
    setLogKind(type);
    setLogOpen(true);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Tabs */}
      <div className="flex items-center gap-2 border-b bg-background px-6 pt-3">
        <button
          onClick={() => setTab("all")}
          className={`relative rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "all"
              ? "bg-muted text-foreground border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          ทั้งหมด
        </button>
        <button
          onClick={() => setTab("line")}
          className={`relative flex items-center gap-2 rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "line"
              ? "bg-muted text-foreground border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>💬 LINE</span>
          {unassignedLine > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white">
              {unassignedLine}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("b2b")}
          className={`relative flex items-center gap-2 rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "b2b"
              ? "bg-muted text-foreground border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>🛒 B2B</span>
        </button>
        <button
          onClick={() => setTab("messages")}
          className={`relative flex items-center gap-2 rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "messages"
              ? "bg-muted text-foreground border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>📩 ข้อความ</span>
          {totalMsgUnread > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
              {totalMsgUnread}
            </span>
          )}
        </button>
      </div>

      {/* Content — Kanban / LINE / B2B tab */}
      {tab === "messages" ? (
        <B2BConversationTab unreadCounts={msgUnread} />
      ) : tab === "b2b" ? (
        <B2BRequestsTab onLeadCreated={() => setRefreshKey((k) => k + 1)} />
      ) : tab === "line" ? (
        <LineRequestsTab onLeadCreated={() => setRefreshKey((k) => k + 1)} />
      ) : (
        <KanbanBoard
          key={refreshKey}
          sourceFilter={tab}
          showClaimButton={false}
          onQuickLog={handleQuickLog}
        />
      )}


      {/* Quick-log dialog (triggered from card buttons) */}
      <ActivityLogDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        leadId={logLeadId}
        defaultKind={logKind}
        title="บันทึกกิจกรรมด่วน"
        onSaved={() => { setLogOpen(false); setRefreshKey((k) => k + 1); }}
      />
    </div>
  );
}
