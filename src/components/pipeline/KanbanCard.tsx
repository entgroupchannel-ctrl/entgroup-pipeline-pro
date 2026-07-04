import { useDraggable } from "@dnd-kit/core";
import { Clock, FileText } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatBaht, daysBetween, timeFromNow, isOverdue } from "@/lib/format";
import { STAGE_LABEL_TH, type Lead, type LeadStage } from "@/lib/crm";
import { activityIcon, type Activity } from "@/lib/activities";

interface Props {
  lead: Lead & {
    account?: { name: string } | null;
    owner?: { full_name: string | null } | null;
    nextActivity?: Activity | null;
  };
  onClick: () => void;
  draggable?: boolean;
}

export function KanbanCard({ lead, onClick, draggable = false }: Props) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: lead.id, disabled: !draggable });
  const stage = (lead.stage as LeadStage) ?? "new";
  const days = daysBetween(lead.updated_at);
  const initials = (lead.owner?.full_name ?? "?")
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const next = lead.nextActivity ?? null;
  const overdue = !!next?.due_at && isOverdue(next.due_at);
  const NextIcon = next ? activityIcon(next.type) : null;
  const subjectShort = next?.subject
    ? next.subject.length > 20
      ? next.subject.slice(0, 20) + "…"
      : next.subject
    : "งานติดตาม";

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="group cursor-pointer rounded-lg border bg-card p-3 shadow-sm transition-all hover:shadow-md hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 flex-1 text-sm font-semibold">{lead.title}</h3>
        <Badge variant="outline" className={`stage-badge-${stage} shrink-0 text-[10px] font-medium`}>
          {STAGE_LABEL_TH[stage]}
        </Badge>
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">{lead.account?.name ?? "ไม่ระบุบริษัท"}</p>
      <div className="mt-2 text-sm font-semibold text-foreground">{formatBaht(Number(lead.expected_value ?? 0))}</div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Avatar className="h-6 w-6">
            <AvatarFallback className="bg-primary/10 text-[10px] text-primary">{initials || "?"}</AvatarFallback>
          </Avatar>
          <span className="text-[11px] text-muted-foreground">{days} วัน</span>
        </div>
        <div className="flex items-center gap-1.5">
          {lead.flowaccount_quotation_no && (
            <span className="inline-flex items-center gap-0.5 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
              <FileText className="h-2.5 w-2.5" /> QT
            </span>
          )}
          {days > 14 && <Clock className="h-3.5 w-3.5 text-red-500" />}
        </div>
      </div>

      {/* Next action row */}
      <div className="mt-2">
        {next && NextIcon && next.due_at ? (
          <div
            className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[11px] font-medium ${
              overdue
                ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                : "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
            }`}
          >
            <div className="flex min-w-0 items-center gap-1">
              <NextIcon className="h-3 w-3 shrink-0" />
              <span className="truncate">{subjectShort}</span>
            </div>
            <span className="shrink-0">{overdue ? "เลยกำหนด" : timeFromNow(next.due_at)}</span>
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground">ไม่มีงานค้าง</div>
        )}
      </div>
    </div>
  );
}
