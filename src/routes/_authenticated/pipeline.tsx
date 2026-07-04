import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/pipeline/KanbanBoard";
import { crmDb } from "@/lib/crm";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/pipeline")({
  component: PipelinePage,
});

function PipelinePage() {
  const [tab, setTab] = useState<"all" | "line">("all");
  const [unassignedLine, setUnassignedLine] = useState(0);

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

  return (
    <div className="flex h-full flex-col">
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
      </div>
      <KanbanBoard sourceFilter={tab} showClaimButton={tab === "line"} />
    </div>
  );
}
