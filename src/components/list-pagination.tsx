import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const DEFAULT_PAGE_SIZES = [10, 25, 50, 100];

export function usePagination<T>(items: T[] | null | undefined, initialSize = 25) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);
  const total = items?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paged = useMemo(() => {
    if (!items) return items ?? [];
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]) as T[];

  return {
    page,
    setPage,
    pageSize,
    setPageSize: (n: number) => {
      setPageSize(n);
      setPage(1);
    },
    totalPages,
    total,
    paged,
    reset: () => setPage(1),
  };
}

interface ListPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizes?: number[];
  className?: string;
}

export function ListPagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  pageSizes = DEFAULT_PAGE_SIZES,
  className = "",
}: ListPaginationProps) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-3 py-2.5 border-t bg-muted/20 text-sm ${className}`}
    >
      <div className="flex items-center gap-3 text-muted-foreground">
        <span>
          แสดง <span className="font-medium text-foreground">{from.toLocaleString()}–{to.toLocaleString()}</span> จาก{" "}
          <span className="font-medium text-foreground">{total.toLocaleString()}</span> รายการ
        </span>
        <div className="flex items-center gap-1.5">
          <span className="hidden sm:inline">ต่อหน้า</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizes.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
          aria-label="หน้าแรก"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="หน้าก่อน"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-2 text-muted-foreground min-w-[80px] text-center">
          หน้า <span className="font-medium text-foreground">{page}</span> / {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="หน้าถัดไป"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          aria-label="หน้าสุดท้าย"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
