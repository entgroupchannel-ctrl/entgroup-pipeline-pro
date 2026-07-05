/**
 * usePermissions — loads role_permissions from DB and exposes can() helper
 * Usage:
 *   const { can, loading } = usePermissions();
 *   can("lead.delete")         // true/false
 *   can("stage.backward")      // checks allowed
 *   can("stage.backward", "require_approval")  // checks flag
 */
import { useEffect, useState } from "react";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";

interface PermRow {
  action: string;
  role: string;
  allowed: boolean;
  require_approval: boolean;
  require_reason: boolean;
}

// Singleton cache keyed by role to avoid refetching on every mount
const cache: Record<string, { rows: PermRow[]; ts: number }> = {};
const CACHE_TTL = 60_000; // 1 minute

export function usePermissions() {
  const { role } = useAuth();
  const [rows, setRows] = useState<PermRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!role) { setLoading(false); return; }

    const now = Date.now();
    const cached = cache[role];
    if (cached && now - cached.ts < CACHE_TTL) {
      setRows(cached.rows);
      setLoading(false);
      return;
    }

    crmDb()
      .from("role_permissions")
      .select("action,role,allowed,require_approval,require_reason")
      .eq("role", role)
      .then(({ data }: { data: PermRow[] | null }) => {
        const r = (data ?? []) as PermRow[];
        cache[role] = { rows: r, ts: Date.now() };
        setRows(r);
        setLoading(false);
      });
  }, [role]);

  /**
   * can(action) — true if allowed=true
   * can(action, "require_approval") — true if require_approval=true
   * can(action, "require_reason")   — true if require_reason=true
   */
  const can = (
    action: string,
    flag?: "require_approval" | "require_reason"
  ): boolean => {
    const row = rows.find((r) => r.action === action);
    if (!row) {
      // Default: admin can do everything, others cannot
      return false;
    }
    if (flag === "require_approval") return row.require_approval;
    if (flag === "require_reason") return row.require_reason;
    return row.allowed;
  };

  return { can, loading };
}

/** Invalidate cache for a role (call after admin saves permissions) */
export function invalidatePermissionCache(role?: string) {
  if (role) delete cache[role];
  else Object.keys(cache).forEach((k) => delete cache[k]);
}
