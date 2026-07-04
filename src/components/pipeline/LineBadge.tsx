import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function LineBadge({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-full bg-[#06C755] px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm animate-pulse", className)}>
      <MessageCircle className="h-2.5 w-2.5 shrink-0" />
      {count > 9 ? "9+" : count}
    </span>
  );
}
