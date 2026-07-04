import { useDraggable } from "@dnd-kit/core";
import { RowActions, stdEdit, stdDupe, stdDelete, stdOpen } from "@/components/ui/row-actions";
import { Star, Clock, FileText, GripVertical } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatBaht, daysBetween, timeFromNow, isOverdue } from "@/lib/format";
import { crmDb, type Lead, type LeadStage } from "@/lib/crm";
import { activityIcon, type Activity } from "@/lib/activities";
import { toast } from "sonner";
import { useRef, useState } from "react";
import { LineBadge } from "./LineBadge";

interface Props {
  lead: Lead & {
    account?: { name: string } | null;
    owner?: { full_name: string | null } | null;
    nextActivity?: Activity | null;
  };
  onClick: () => void;
  draggable?: boolean;
  onDelete?: () => void;
  onDuplicate?: () => void;
  lineUnread?: number;
  onLineBadgeClear?: () => void;
  showClaimButton?: boolean;
  currentUserId?: string;
  onClaim?: () => void;
  linePreview?: string;
}


// Priority: 0 = none, 1 = low, 2 = medium, 3 = high
function PriorityStars({ priority, leadId, onChange }: {
  priority: number;
  leadId: string;
  onChange: (p: number) => void;
}) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex items-center gap-0.5" onMouseLeave={() => setHovered(0)}>
      {[1, 2, 3].map((star) => {
        const filled = hovered ? star <= hovered : star <= priority;
        return (
          <button
            key={star}
            type="button"
            onMouseEnter={() => setHovered(star)}
            onClick={(e) => {
              e.stopPropagation();
              // toggle off if clicking same star
              onChange(priority === star ? 0 : star);
            }}
            className="focus:outline-none"
          >
            <Star
              className={`h-3.5 w-3.5 transition-colors ${
                filled
                  ? "fill-amber-400 text-amber-400"
                  : "fill-transparent text-muted-foreground/40 hover:text-amber-300"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

export function KanbanCard({ lead, onClick, draggable = false, onDelete, onDuplicate, lineUnread = 0, onLineBadgeClear }: Props) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: lead.id, disabled: !draggable });
  const downRef = useRef<{ x: number; y: number } | null>(null);

  const priority = (lead as any).priority ?? 0;
  const [localPriority, setLocalPriority] = useState<number>(priority);

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
    ? next.subject.length > 22 ? next.subject.slice(0, 22) + "…" : next.subject
    : "งานติดตาม";

  const savePriority = async (p: number) => {
    setLocalPriority(p);
    const { error } = await crmDb().from("leads").update({ priority: p } as any).eq("id", lead.id);
    if (error) toast.error("บันทึก priority ไม่สำเร็จ");
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onPointerDown={(e) => { downRef.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={(e) => {
        const d = downRef.current;
        downRef.current = null;
        if (!d) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (Math.hypot(dx, dy) < 6) { onLineBadgeClear?.(); onClick?.(); }
      }}
      className="group cursor-pointer rounded-lg border bg-card p-3 shadow-sm transition-all hover:shadow-md hover:border-primary/30 select-none touch-none"
    >
      {/* Title row with drag handle + 3-dot menu */}
      <div className="flex items-start justify-between gap-1 -mr-1">
        {/* Drag handle visual affordance (whole card is draggable) */}
        <div
          className="mt-0.5 shrink-0 cursor-grab text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
          title="ลาก"
        >
          <GripVertical className="h-4 w-4" />
        </div>
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug flex-1">{lead.title}</h3>
        <LineBadge count={lineUnread} />
        <div
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          className="-mt-0.5"
        >
          <RowActions
            align="right"
            actions={[
              stdOpen(onClick),
              stdDupe(onDuplicate ?? (() => {})),
              stdDelete(onDelete ?? (() => {})),
            ]}
          />
        </div>
      </div>

      {/* Account */}
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{lead.account?.name ?? "ไม่ระบุบริษัท"}</p>

      {/* Value */}
      <div className="mt-2 text-sm font-bold text-foreground">
        {formatBaht(Number(lead.expected_value ?? 0))}
      </div>

      {/* Next activity badge */}
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
          <div className="h-5" /> // spacer to keep card height consistent
        )}
      </div>

      {/* Bottom row: stars + indicators + avatar */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <PriorityStars
          priority={localPriority}
          leadId={lead.id}
          onChange={savePriority}
        />

        <div className="flex items-center gap-1.5">
          {/* FA quotation tag */}
          {(lead.flowaccount_quotation_no || (lead as any).fa_inbound_id) && (
            <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              <FileText className="h-2.5 w-2.5" /> QT
            </span>
          )}
          {/* Aging warning */}
          {days > 14 && (
            <span title={`อยู่ใน stage นี้ ${days} วัน`}>
              <Clock className="h-3.5 w-3.5 text-red-500" />
            </span>
          )}
          {/* Owner avatar */}
          <Avatar className="h-6 w-6">
            <AvatarFallback className="bg-primary/10 text-[10px] text-primary">{initials || "?"}</AvatarFallback>
          </Avatar>
        </div>
      </div>
    </div>
  );
}
