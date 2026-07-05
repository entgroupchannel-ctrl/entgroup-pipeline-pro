import { useEffect, useState } from "react";
import { Shield, Loader2, Save, RotateCcw, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Permission {
  id: string;
  action: string;
  role: "sales" | "manager" | "admin";
  allowed: boolean;
  require_approval: boolean;
  require_reason: boolean;
}

type ActionDef = {
  key: string;
  label: string;
  sub?: string;
  group: string;
  lockAdmin?: boolean; // admin always true
  lockSalesAllow?: boolean; // sales always false
};

// ── Action definitions (mirrors the agreed matrix) ────────────────────────────

const ACTIONS: ActionDef[] = [
  // Lead
  { key: "lead.create",      label: "สร้างดีลใหม่",        group: "ดีล (Lead)" },
  { key: "lead.edit",        label: "แก้ไขข้อมูลดีล",      sub: "มูลค่า, วันปิด, source", group: "ดีล (Lead)" },
  { key: "stage.advance",    label: "เดินหน้า stage",       sub: "new→qualified→proposal→...", group: "ดีล (Lead)" },
  { key: "stage.backward",   label: "ถอยหลัง stage",        sub: "proposal→qualified ฯลฯ", group: "ดีล (Lead)" },
  { key: "lead.close",       label: "ปิด Won / Lost",       group: "ดีล (Lead)" },
  { key: "lead.delete",      label: "ลบดีล",               group: "ดีล (Lead)", lockAdmin: true },
  // Activity
  { key: "activity.create",  label: "บันทึกกิจกรรม",       group: "กิจกรรม (Activity)" },
  { key: "activity.delete",  label: "ลบกิจกรรม",           group: "กิจกรรม (Activity)", lockAdmin: true },
  // Quotation
  { key: "quotation.create", label: "สร้าง / แก้ไข",       group: "ใบเสนอราคา (Quotation)" },
  { key: "quotation.delete", label: "ลบใบเสนอราคา",        group: "ใบเสนอราคา (Quotation)", lockAdmin: true },
  // Account
  { key: "account.create",   label: "สร้าง / แก้ไข",       group: "ข้อมูลลูกค้า / บริษัท" },
  { key: "account.delete",   label: "ลบบริษัท",            group: "ข้อมูลลูกค้า / บริษัท", lockAdmin: true },
  // System
  { key: "stage_request.review",  label: "อนุมัติ/ปฏิเสธ คำขอถอย stage",  group: "ระบบ Stage Change (ใหม่)", lockAdmin: true },
  { key: "delete_request.review", label: "อนุมัติ/ปฏิเสธ คำขอลบ",         group: "ระบบ Stage Change (ใหม่)", lockAdmin: true },
];

const ROLES: ("sales" | "manager" | "admin")[] = ["sales", "manager", "admin"];
const ROLE_LABEL = { sales: "Sales", manager: "Manager", admin: "Admin" };

// ── Cell badge ─────────────────────────────────────────────────────────────────

function CellBadge({
  perm, locked, onToggle,
}: {
  perm: Permission | undefined;
  locked: boolean;
  onToggle: (field: "allowed" | "require_approval" | "require_reason") => void;
}) {
  if (!perm) return <span className="text-xs text-muted-foreground">—</span>;

  if (locked) {
    // Admin locked cells — show state but not editable
    if (perm.allowed && !perm.require_approval) {
      return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">✓ ได้เลย</span>;
    }
    return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">✗ ทำไม่ได้</span>;
  }

  // Editable cell
  if (!perm.allowed && !perm.require_approval) {
    return (
      <button onClick={() => onToggle("allowed")}
        className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-200 transition-colors dark:bg-red-950/40 dark:text-red-300">
        ✗ ทำไม่ได้
      </button>
    );
  }
  if (perm.require_approval) {
    return (
      <div className="space-y-1">
        <button onClick={() => onToggle("require_approval")}
          className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-200 transition-colors dark:bg-amber-950/40 dark:text-amber-300">
          ขออนุมัติ
        </button>
        <div>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={perm.require_reason}
              onChange={() => onToggle("require_reason")}
              className="h-3 w-3"
            />
            <span className="text-[10px] text-muted-foreground">ต้องระบุเหตุผล</span>
          </label>
        </div>
      </div>
    );
  }
  // allowed = true
  return (
    <div className="space-y-1">
      <button onClick={() => onToggle("allowed")}
        className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-200 transition-colors dark:bg-emerald-950/40 dark:text-emerald-300">
        ✓ ได้เลย
      </button>
      {(perm.role !== "admin") && (
        <div>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={perm.require_reason}
              onChange={() => onToggle("require_reason")}
              className="h-3 w-3"
            />
            <span className="text-[10px] text-muted-foreground">ต้องระบุเหตุผล</span>
          </label>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PermissionsTab() {
  const { user } = useAuth();
  const [perms, setPerms] = useState<Permission[]>([]);
  const [original, setOriginal] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await crmDb()
      .from("role_permissions")
      .select("*")
      .order("action");
    if (error) { toast.error("โหลดไม่สำเร็จ"); setLoading(false); return; }
    setPerms((data ?? []) as Permission[]);
    setOriginal((data ?? []) as Permission[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const getPerm = (action: string, role: string) =>
    perms.find((p) => p.action === action && p.role === role);

  const toggle = (action: string, role: "sales" | "manager" | "admin", field: "allowed" | "require_approval" | "require_reason") => {
    setPerms((prev) => prev.map((p) => {
      if (p.action !== action || p.role !== role) return p;
      if (field === "allowed") {
        // cycle: false → true → require_approval → false
        if (!p.allowed && !p.require_approval) return { ...p, allowed: true, require_approval: false };
        if (p.allowed && !p.require_approval) return { ...p, allowed: false, require_approval: true };
        if (p.require_approval) return { ...p, allowed: false, require_approval: false, require_reason: false };
      }
      if (field === "require_approval") {
        // toggle approval off → back to allowed
        return { ...p, allowed: true, require_approval: false };
      }
      if (field === "require_reason") {
        return { ...p, require_reason: !p.require_reason };
      }
      return p;
    }));
  };

  const hasChanges = JSON.stringify(perms) !== JSON.stringify(original);

  const save = async () => {
    setSaving(true);
    const changed = perms.filter((p) => {
      const orig = original.find((o) => o.id === p.id);
      return orig && (orig.allowed !== p.allowed || orig.require_approval !== p.require_approval || orig.require_reason !== p.require_reason);
    });

    let failed = 0;
    for (const p of changed) {
      const { error } = await crmDb()
        .from("role_permissions")
        .update({
          allowed: p.allowed,
          require_approval: p.require_approval,
          require_reason: p.require_reason,
          updated_at: new Date().toISOString(),
          updated_by: user?.id,
        })
        .eq("id", p.id);
      if (error) failed++;
    }
    setSaving(false);
    if (failed > 0) { toast.error(`บันทึกไม่สำเร็จ ${failed} รายการ`); return; }
    toast.success(`บันทึก ${changed.length} รายการแล้ว`);
    load();
  };

  const reset = () => setPerms(original);

  // Group actions
  const groups = Array.from(new Set(ACTIONS.map((a) => a.group)));

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" /> Permission Matrix
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            คลิกที่ badge เพื่อเปลี่ยนสิทธิ์ — Admin จะถูก lock บางส่วนเพื่อความปลอดภัย
          </p>
        </div>
        <div className="flex gap-2">
          {hasChanges && (
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> ยกเลิก
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={saving || !hasChanges}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
            บันทึก
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 rounded-xl border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-800">✓ ได้เลย</span>
          ทำได้ทันที
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">ขออนุมัติ</span>
          ต้องรอ approve
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] text-red-700">✗ ทำไม่ได้</span>
          ไม่มีสิทธิ์
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto">
          <Info className="h-3.5 w-3.5" />
          คลิก badge เพื่อสลับสิทธิ์
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-[45%]">การกระทำ</th>
              {ROLES.map((r) => (
                <th key={r} className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {ROLE_LABEL[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const groupActions = ACTIONS.filter((a) => a.group === group);
              return (
                <>
                  {/* Group header */}
                  <tr key={`g-${group}`} className="bg-muted/20">
                    <td colSpan={4} className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {group}
                    </td>
                  </tr>
                  {groupActions.map((action) => (
                    <tr key={action.key} className="border-t hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm">{action.label}</div>
                        {action.sub && <div className="text-[11px] text-muted-foreground mt-0.5">{action.sub}</div>}
                      </td>
                      {ROLES.map((role) => {
                        const perm = getPerm(action.key, role);
                        const locked = role === "admin" && !!action.lockAdmin;
                        return (
                          <td key={role} className="px-4 py-3 text-center">
                            <CellBadge
                              perm={perm}
                              locked={locked}
                              onToggle={(field) => toggle(action.key, role, field)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasChanges && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก — กด "บันทึก" เพื่อให้มีผล
        </div>
      )}
    </div>
  );
}
