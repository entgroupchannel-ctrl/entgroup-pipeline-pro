import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({ page, totalPages, total, pageSize, onChange }: {
  page: number; totalPages: number; total: number; pageSize: number;
  onChange: (p: number) => void;
}) {
  const from = page * pageSize + 1;
  const to   = Math.min((page + 1) * pageSize, total);
  return (
    <div className="flex items-center justify-between border-t bg-muted/20 px-5 py-3 text-xs text-muted-foreground">
      <span>แสดง {from}–{to} จาก {total}</span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-7 w-7"
          onClick={() => onChange(Math.max(0, page - 1))} disabled={page === 0}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="tabular-nums px-2">{page + 1} / {totalPages}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7"
          onClick={() => onChange(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
