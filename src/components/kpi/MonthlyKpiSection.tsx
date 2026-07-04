// Monthly KPI section — used in both KPI page and Dashboard
// Manager can set per-person per-month targets; sales sees own progress
import { useEffect, useState } from "react";
import {
  TrendingUp, Trophy, Users, ChevronLeft, ChevronRight,
  Loader2, Save, Edit2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";
import { formatBaht } from "@/lib/format";
import { toast } from "sonner";

const MONTH_TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

interface MonthlyTarget {
  id?: string; user_id: string; year: number; month: number;
  revenue_target: number; won_deals_target: number; new_accounts_target: number; note?: string | null;
}
interface MonthlyActual { revenue: number; won_deals: number; new_accounts: number; }

function pct(actual: number, target: number) {
  if (!target) return null;
  return Math.min(100, Math.round((actual / target) * 100));
}

function ProgressBar({ actual, target, color }: { actual: number; target: number; color: string }) {
  const p = pct(actual, target);
  if (p === null) return <div className="text-[10px] text-muted-foreground">ยังไม่มีเป้า</div>;
  const done = actual >= target;
  return (
    <div className="space-y-0.5">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${p}%`, backgroundColor: done ? "#10b981" : color }} />
      </div>
      <div className="text-[10px] text-muted-foreground">{done ? "✓ บรรลุ" : `${p}%`}</div>
    </div>
  );
}

interface Props { focusUserId?: string | null; }

export function MonthlyKpiSection({ focusUserId }: Props) {
  const { user, role } = useAuth();
  const isManager = role === "manager" || role === "admin";

  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [targets, setTargets]   = useState<MonthlyTarget[]>([]);
  const [actuals, setActuals]   = useState<Map<string, MonthlyActual>>(new Map());
  const [loading, setLoading]   = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ revenue: "", won_deals: "", new_accounts: "", note: "" });
  const [saving, setSaving] = useState(false);

  const monthStart = new Date(year, month - 1, 1).toISOString();
  const monthEnd   = new Date(year, month, 1).toISOString();

  const load = async () => {
    setLoading(true);
    const profRes = await crmDb().from("user_profiles").select("id,full_name,role,is_active").eq("is_active", true);
    const salesProfiles = (profRes.data ?? []).filter((p: any) => p.role === "sales" || p.role === "manager");
    setProfiles(salesProfiles);

    let tq = crmDb().from("kpi_monthly_targets").select("*").eq("year", year).eq("month", month);
    if (!isManager && user) tq = tq.eq("user_id", user.id);
    const targRes = await tq;
    setTargets((targRes.data ?? []) as MonthlyTarget[]);

    const userIds = isManager ? salesProfiles.map((p: any) => p.id) : [user?.id ?? ""];
    const [wonRes, newAccRes] = await Promise.all([
      crmDb().from("leads").select("id,owner_id,expected_value,stage,updated_at")
        .eq("stage", "won").gte("updated_at", monthStart).lt("updated_at", monthEnd),
      crmDb().from("accounts").select("id,owner_id,created_at")
        .gte("created_at", monthStart).lt("created_at", monthEnd),
    ]);
    const map = new Map<string, MonthlyActual>();
    for (const uid of userIds) {
      const won = (wonRes.data ?? []).filter((l: any) => l.owner_id === uid);
      const newAcc = (newAccRes.data ?? []).filter((a: any) => a.owner_id === uid);
      map.set(uid, {
        revenue:      won.reduce((s: number, l: any) => s + Number(l.expected_value ?? 0), 0),
        won_deals:    won.length,
        new_accounts: newAcc.length,
      });
    }
    setActuals(map);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [year, month]);

  const prevMonth = () => { if (month === 1) { setYear(y => y-1); setMonth(12); } else setMonth(m => m-1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y+1); setMonth(1); } else setMonth(m => m+1); };
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  const startEdit = (uid: string) => {
    const t = targets.find(t => t.user_id === uid);
    setEditForm({ revenue: String(t?.revenue_target ?? 0), won_deals: String(t?.won_deals_target ?? 0), new_accounts: String(t?.new_accounts_target ?? 0), note: t?.note ?? "" });
    setEditingId(uid);
  };

  const saveTarget = async (uid: string) => {
    setSaving(true);
    const { error } = await crmDb().from("kpi_monthly_targets").upsert({
      user_id: uid, year, month,
      revenue_target: parseFloat(editForm.revenue) || 0,
      won_deals_target: parseInt(editForm.won_deals) || 0,
      new_accounts_target: parseInt(editForm.new_accounts) || 0,
      note: editForm.note.trim() || null,
      set_by: user?.id,
    }, { onConflict: "user_id,year,month" });
    setSaving(false);
    if (error) { toast.error("บันทึกไม่สำเร็จ", { description: error.message }); return; }
    toast.success("บันทึกเป้าหมายแล้ว");
    setEditingId(null);
    load();
  };

  const displayProfiles = focusUserId
    ? profiles.filter(p => p.id === focusUserId)
    : isManager ? profiles : profiles.filter(p => p.id === user?.id);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      {/* Period navigator */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" /> เป้าหมายรายเดือน
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[80px] text-center text-sm font-medium">
            {MONTH_TH[month - 1]} {year + 543}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isCurrentMonth && (
            <Button variant="ghost" size="sm" className="h-7 text-xs ml-1"
              onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1); }}>
              เดือนนี้
            </Button>
          )}
        </div>
      </div>

      {/* Sales rows */}
      <div className="space-y-3">
        {displayProfiles.length === 0 && (
          <div className="rounded-xl border border-dashed py-8 text-center text-xs text-muted-foreground">ยังไม่มีข้อมูล</div>
        )}
        {displayProfiles.map((p) => {
          const t = targets.find(t => t.user_id === p.id);
          const a = actuals.get(p.id) ?? { revenue: 0, won_deals: 0, new_accounts: 0 };
          const initials = (p.full_name ?? "?").split(" ").map((s: string) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
          const isEditing = editingId === p.id;
          const isMe = p.id === user?.id;

          return (
            <div key={p.id} className={`rounded-xl border bg-card p-4 ${isMe ? "border-primary/30" : ""}`}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10 text-xs text-primary">{initials}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-sm font-medium">{p.full_name ?? "—"}</div>
                    {isMe && <div className="text-[10px] text-primary">คุณ</div>}
                  </div>
                  {!t && isManager && (
                    <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">ยังไม่มีเป้า</Badge>
                  )}
                </div>
                {isManager && !isEditing && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => startEdit(p.id)}>
                    <Edit2 className="h-3 w-3" />{t ? "แก้ไข" : "ตั้งเป้า"}
                  </Button>
                )}
                {isEditing && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditingId(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" className="h-7 px-3 text-xs" onClick={() => saveTarget(p.id)} disabled={saving}>
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      บันทึก
                    </Button>
                  </div>
                )}
              </div>

              {isEditing ? (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: "revenue",      label: "Revenue (บาท)" },
                    { key: "won_deals",    label: "Won deals (ดีล)" },
                    { key: "new_accounts", label: "ลูกค้าใหม่ (ราย)" },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="text-[11px] text-muted-foreground">{label}</label>
                      <Input type="number" min="0" className="h-8 mt-1 text-sm"
                        value={editForm[key as keyof typeof editForm]}
                        onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })} />
                    </div>
                  ))}
                  <div className="col-span-3">
                    <label className="text-[11px] text-muted-foreground">หมายเหตุ</label>
                    <Input className="h-8 mt-1 text-sm" placeholder="optional"
                      value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1">
                      <TrendingUp className="h-3 w-3" /> Revenue
                    </div>
                    <div className="text-sm font-bold tabular-nums">{formatBaht(a.revenue)}</div>
                    {t && <div className="text-[10px] text-muted-foreground">เป้า {formatBaht(t.revenue_target)}</div>}
                    <div className="mt-1.5"><ProgressBar actual={a.revenue} target={t?.revenue_target ?? 0} color="#0096C7" /></div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1">
                      <Trophy className="h-3 w-3" /> Won Deals
                    </div>
                    <div className="text-sm font-bold tabular-nums">{a.won_deals}</div>
                    {t && <div className="text-[10px] text-muted-foreground">เป้า {t.won_deals_target} ดีล</div>}
                    <div className="mt-1.5"><ProgressBar actual={a.won_deals} target={t?.won_deals_target ?? 0} color="#7c3aed" /></div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1">
                      <Users className="h-3 w-3" /> ลูกค้าใหม่
                    </div>
                    <div className="text-sm font-bold tabular-nums">{a.new_accounts}</div>
                    {t && <div className="text-[10px] text-muted-foreground">เป้า {t.new_accounts_target} ราย</div>}
                    <div className="mt-1.5"><ProgressBar actual={a.new_accounts} target={t?.new_accounts_target ?? 0} color="#d97706" /></div>
                  </div>
                  {t?.note && (
                    <div className="col-span-3 text-[11px] text-muted-foreground italic border-t pt-2">📝 {t.note}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
