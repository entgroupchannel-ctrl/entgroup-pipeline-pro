// Reusable 3-dot row action menu — used across all list pages
import { useState, useRef, useEffect } from "react";
import { MoreHorizontal, Edit2, Trash2, Copy, ExternalLink } from "lucide-react";

export interface RowAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "danger";
  divider?: boolean; // show divider above this item
}

interface Props {
  actions: RowAction[];
  align?: "left" | "right";
}

export function RowActions({ actions, align = "right" }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${open ? "bg-muted text-foreground" : ""}`}
        title="ตัวเลือก"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div
            className={`absolute z-30 mt-1 min-w-[160px] rounded-lg border bg-popover py-1 shadow-lg ${align === "right" ? "right-0" : "left-0"}`}
          >
            {actions.map((a, i) => (
              <div key={i}>
                {a.divider && i > 0 && <div className="my-1 border-t" />}
                <button
                  type="button"
                  onClick={() => { setOpen(false); a.onClick(); }}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-muted ${
                    a.variant === "danger" ? "text-red-600 hover:text-red-700" : "text-foreground"
                  }`}
                >
                  {a.icon && <span className="h-4 w-4 shrink-0">{a.icon}</span>}
                  {a.label}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Bulk action toolbar — shows when items are selected
interface BulkProps {
  count: number;
  total: number;
  onSelectAll: () => void;
  onClearAll: () => void;
  actions: { label: string; icon?: React.ReactNode; onClick: () => void; variant?: "default" | "danger" }[];
}

export function BulkActionBar({ count, total, onSelectAll, onClearAll, actions }: BulkProps) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 shadow-sm">
      <div className="flex items-center gap-2">
        <button onClick={onClearAll} className="flex h-5 w-5 items-center justify-center rounded border-2 border-primary bg-primary text-primary-foreground">
          <span className="text-[10px] font-bold">✓</span>
        </button>
        <span className="text-sm font-medium">เลือก {count} รายการ</span>
        {count < total && (
          <button onClick={onSelectAll} className="text-xs text-primary hover:underline">
            เลือกทั้งหมด {total} รายการ
          </button>
        )}
        {count === total && (
          <button onClick={onClearAll} className="text-xs text-muted-foreground hover:underline">
            ยกเลิก
          </button>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {actions.map((a, i) => (
          <button
            key={i}
            onClick={a.onClick}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              a.variant === "danger"
                ? "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-950/40 dark:text-red-300"
                : "bg-background border text-foreground hover:bg-muted"
            }`}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Pre-built standard actions
export const stdEdit   = (onClick: () => void): RowAction => ({ label: "แก้ไข",      icon: <Edit2 className="h-4 w-4" />,        onClick });
export const stdDupe   = (onClick: () => void): RowAction => ({ label: "สร้างซ้ำ",   icon: <Copy className="h-4 w-4" />,         onClick });
export const stdOpen   = (onClick: () => void): RowAction => ({ label: "เปิดหน้าเต็ม", icon: <ExternalLink className="h-4 w-4" />, onClick });
export const stdDelete = (onClick: () => void): RowAction => ({ label: "ลบ", icon: <Trash2 className="h-4 w-4" />, onClick, variant: "danger", divider: true });
