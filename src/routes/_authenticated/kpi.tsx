import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Phone, Mail, MessageCircle, Users, FileText, TrendingUp,
  Loader2, Trophy, Target, CheckCircle2, Star,
} from "lucide-react";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";
import { formatBaht } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { MonthlyKpiSection } from "@/components/kpi/MonthlyKpiSection";

export const Route = createFileRoute("/_authenticated/kpi")({
  component: KpiPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface KpiTarget {
  id: string;
  user_id: string;
  calls_per_day: number;
  emails_per_day: number;
  lines_per_day: number;
  meetings_per_week: number;
  quotations_per_month: number;
  pos_per_month: number;
  revenue_target: number;
}

interface KpiActual {
  calls: number;
  emails: number;
  lines: number;
  meetings: number;
  quotations: number;
  revenue: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function startOfDay() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
}
function startOfWeek() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function startOfMonth() {
  const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function pct(actual: number, target: number) {
  if (!target) return 0;
  return Math.min(100, Math.round((actual / target) * 100));
}

// ── Progress ring ─────────────────────────────────────────────────────────────

function Ring({ value, max, size = 64, color = "#0096C7" }: {
  value: number; max: number; size?: number; color?: string;
}) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const p = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}
        strokeWidth={6} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - p)}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
    </svg>
  );
}

// ── KPI metric card ───────────────────────────────────────────────────────────

function MetricCard({ label, actual, target, icon, color, unit = "" }: {
  label: string; actual: number; target: number;
  icon: React.ReactNode; color: string; unit?: string;
}) {
  const p = pct(actual, target);
  const done = target > 0 && actual >= target;
  return (
    <div className={`relative rounded-xl border bg-card p-4 transition-all ${done ? "border-emerald-300 dark:border-emerald-800" : ""}`}>
      {done && (
        <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-emerald-500" />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {icon}
            {label}
          </div>
          <div className="mt-2 flex items-end gap-1">
            <span className="text-2xl font-bold tabular-nums">{actual.toLocaleString()}</span>
            {target > 0 && (
              <span className="mb-0.5 text-sm text-muted-foreground">/ {target.toLocaleString()}{unit}</span>
            )}
          </div>
          {target > 0 && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${p}%`, backgroundColor: done ? "#10b981" : color }}
              />
            </div>
          )}
          {target > 0 && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              {done ? "✓ บรรลุเป้าหมาย" : `${p}% ของเป้า`}
            </div>
          )}
          {target === 0 && (
            <div className="mt-1 text-[11px] text-amber-600">ยังไม่ได้ตั้งเป้าหมาย</div>
          )}
        </div>
        <Ring value={actual} max={target || 1} size={56} color={done ? "#10b981" : color} />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function KpiPage() {
  const { user, role } = useAuth();
  const isManager = role === "manager" || role === "admin";

  const [profiles, setProfiles] = useState<any[]>([]);
  const [targets, setTargets] = useState<KpiTarget[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [setTargetOpen, setSetTargetOpen] = useState(false);
  const [targetUserId, setTargetUserId] = useState<string>("");
  const [targetSelf, setTargetSelf] = useState(false);

  const load = async () => {
    setLoading(true);
    const [profRes, targRes, actRes, leadsRes] = await Promise.all([
      crmDb().from("user_profiles").select("id,full_name,role,is_active").eq("is_active", true),
      crmDb().from("kpi_targets").select("*"),
      crmDb().from("activities").select("*")
        .gte("created_at", startOfMonth())
        .in("type", ["call", "email", "line", "meeting"]),
      crmDb().from("leads").select("id,owner_id,stage,expected_value,flowaccount_quotation_no,fa_inbound_id,created_at")
        .gte("created_at", startOfMonth()),
    ]);
    setProfiles((profRes.data ?? []).filter((p: any) => p.role === "sales" || p.role === "manager"));
    setTargets((targRes.data ?? []) as KpiTarget[]);
    setActivities(actRes.data ?? []);
    setLeads(leadsRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // compute actuals per user
  const actualsMap = useMemo(() => {
    const map = new Map<string, KpiActual>();
    const today = startOfDay();
    const week  = startOfWeek();
    const month = startOfMonth();

    for (const p of profiles) {
      const uid = p.id;
      const myActs = activities.filter((a: any) => a.owner_id === uid);
      const myLeads = leads.filter((l: any) => l.owner_id === uid);

      const calls    = myActs.filter((a: any) => a.type === "call" && a.done && a.done_at >= today).length;
      const emails   = myActs.filter((a: any) => a.type === "email" && a.done && a.done_at >= today).length;
      const lines    = myActs.filter((a: any) => a.type === "line" && a.done && a.done_at >= today).length;
      const meetings = myActs.filter((a: any) => a.type === "meeting" && a.done && a.done_at >= week).length;
      const quotations = myLeads.filter((l: any) => l.flowaccount_quotation_no || l.fa_inbound_id).length;
      const revenue  = myLeads.filter((l: any) => l.stage === "won").reduce((s: number, l: any) => s + Number(l.expected_value ?? 0), 0);

      map.set(uid, { calls, emails, lines, meetings, quotations, revenue });
    }
    return map;
  }, [profiles, activities, leads]);

  const myTarget = targets.find((t) => t.user_id === user?.id);
  const myActual = actualsMap.get(user?.id ?? "") ?? { calls: 0, emails: 0, lines: 0, meetings: 0, quotations: 0, revenue: 0 };

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-6 page-fade-in space-y-8">

      {/* ── My KPI ── */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" /> KPI ของฉัน
            </h1>
            <p className="text-xs text-muted-foreground">วันนี้ / สัปดาห์นี้ / เดือนนี้</p>
          </div>
          {isManager && (
            <Button size="sm" variant="outline" onClick={() => { setTargetSelf(true); setSetTargetOpen(true); }}>
              ตั้งเป้าหมายตัวเอง
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard label="โทรวันนี้" actual={myActual.calls} target={myTarget?.calls_per_day ?? 0}
            icon={<Phone className="h-3.5 w-3.5" />} color="#0096C7" />
          <MetricCard label="Email วันนี้" actual={myActual.emails} target={myTarget?.emails_per_day ?? 0}
            icon={<Mail className="h-3.5 w-3.5" />} color="#7c3aed" />
          <MetricCard label="Line วันนี้" actual={myActual.lines} target={myTarget?.lines_per_day ?? 0}
            icon={<MessageCircle className="h-3.5 w-3.5" />} color="#16a34a" />
          <MetricCard label="เข้าพบสัปดาห์นี้" actual={myActual.meetings} target={myTarget?.meetings_per_week ?? 0}
            icon={<Users className="h-3.5 w-3.5" />} color="#d97706" />
          <MetricCard label="QT เดือนนี้" actual={myActual.quotations} target={myTarget?.quotations_per_month ?? 0}
            icon={<FileText className="h-3.5 w-3.5" />} color="#db2777" />
          <MetricCard label="Revenue เดือนนี้" actual={myActual.revenue} target={myTarget?.revenue_target ?? 0}
            icon={<TrendingUp className="h-3.5 w-3.5" />} color="#059669" unit="฿" />
        </div>

        {!myTarget && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
            ⚠ ยังไม่มีเป้าหมาย — ติดต่อ Manager เพื่อตั้งเป้าหมาย
          </div>
        )}
      </section>

      {/* ── Manager: Leaderboard ── */}
      {isManager && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" /> Leaderboard ทีม
            </h2>
            <Button size="sm" onClick={() => { setTargetSelf(false); setTargetUserId(""); setSetTargetOpen(true); }}>
              ตั้งเป้าหมายพนักงาน
            </Button>
          </div>

          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <th className="px-4 py-3 text-left font-medium">#</th>
                    <th className="px-4 py-3 text-left font-medium">Sales</th>
                    <th className="px-4 py-3 text-center font-medium">โทร</th>
                    <th className="px-4 py-3 text-center font-medium">Email</th>
                    <th className="px-4 py-3 text-center font-medium">Line</th>
                    <th className="px-4 py-3 text-center font-medium">เข้าพบ</th>
                    <th className="px-4 py-3 text-center font-medium">QT</th>
                    <th className="px-4 py-3 text-right font-medium">Revenue</th>
                    <th className="px-4 py-3 text-center font-medium">Score</th>
                    <th className="px-2 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {profiles
                    .map((p) => {
                      const actual = actualsMap.get(p.id) ?? { calls: 0, emails: 0, lines: 0, meetings: 0, quotations: 0, revenue: 0 };
                      const t = targets.find((t) => t.user_id === p.id);
                      const score = [
                        pct(actual.calls,    t?.calls_per_day ?? 0),
                        pct(actual.emails,   t?.emails_per_day ?? 0),
                        pct(actual.lines,    t?.lines_per_day ?? 0),
                        pct(actual.meetings, t?.meetings_per_week ?? 0),
                        pct(actual.quotations, t?.quotations_per_month ?? 0),
                        pct(actual.revenue,  t?.revenue_target ?? 0),
                      ].filter((_, i) => [
                        t?.calls_per_day, t?.emails_per_day, t?.lines_per_day,
                        t?.meetings_per_week, t?.quotations_per_month, t?.revenue_target,
                      ][i]);
                      const avgScore = score.length ? Math.round(score.reduce((a, b) => a + b, 0) / score.length) : 0;
                      return { ...p, actual, target: t, avgScore };
                    })
                    .sort((a, b) => b.avgScore - a.avgScore)
                    .map((p, idx) => {
                      const t = p.target;
                      const initials = (p.full_name ?? "?").split(" ").map((s: string) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
                      return (
                        <tr key={p.id} className={`hover:bg-muted/30 transition-colors ${p.id === user?.id ? "bg-primary/5" : ""}`}>
                          <td className="px-4 py-3">
                            {idx === 0 ? <Trophy className="h-4 w-4 text-amber-400" />
                              : idx === 1 ? <Trophy className="h-4 w-4 text-slate-400" />
                              : idx === 2 ? <Trophy className="h-4 w-4 text-orange-600" />
                              : <span className="text-xs text-muted-foreground">{idx + 1}</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-7 w-7">
                                <AvatarFallback className="bg-primary/10 text-[10px] text-primary">{initials}</AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-medium text-sm">{p.full_name ?? "—"}</div>
                                {p.id === user?.id && <div className="text-[10px] text-primary">คุณ</div>}
                              </div>
                            </div>
                          </td>
                          {[
                            [p.actual.calls,    t?.calls_per_day],
                            [p.actual.emails,   t?.emails_per_day],
                            [p.actual.lines,    t?.lines_per_day],
                            [p.actual.meetings, t?.meetings_per_week],
                            [p.actual.quotations, t?.quotations_per_month],
                          ].map(([actual, target], i) => {
                            const p2 = pct(Number(actual), Number(target ?? 0));
                            const done = Number(target) > 0 && Number(actual) >= Number(target);
                            return (
                              <td key={i} className="px-4 py-3 text-center">
                                <div className={`text-sm font-medium ${done ? "text-emerald-600" : ""}`}>
                                  {Number(actual)}
                                  {Number(target) > 0 && <span className="text-xs text-muted-foreground">/{target}</span>}
                                </div>
                                {Number(target) > 0 && (
                                  <div className="mx-auto mt-1 h-1 w-12 overflow-hidden rounded-full bg-muted">
                                    <div className="h-full rounded-full" style={{ width: `${p2}%`, backgroundColor: done ? "#10b981" : "#0096C7" }} />
                                  </div>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-right text-sm font-medium">
                            {formatBaht(p.actual.revenue)}
                            {t?.revenue_target ? (
                              <div className="text-[10px] text-muted-foreground">/ {formatBaht(t.revenue_target)}</div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {p.avgScore > 0 ? (
                              <Badge className={`text-xs ${p.avgScore >= 100 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : p.avgScore >= 70 ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground"}`}>
                                {p.avgScore}%
                              </Badge>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </td>
                          <td className="px-2 py-3">
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                              onClick={() => { setTargetUserId(p.id); setSetTargetOpen(true); }}>
                              ตั้งเป้า
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ── Monthly KPI ── */}
      <section className="rounded-xl border bg-card p-5">
        <MonthlyKpiSection focusUserId={isManager ? null : user?.id} />
      </section>

      {/* ── Set Target Dialog ── */}
      <SetTargetDialog
        open={setTargetOpen}
        onOpenChange={setSetTargetOpen}
        userId={targetSelf ? user?.id ?? "" : targetUserId}
        profiles={profiles}
        existing={targets.find((t) => t.user_id === (targetSelf ? user?.id ?? "" : targetUserId)) ?? null}
        onSaved={() => { setSetTargetOpen(false); setTargetSelf(false); load(); }}
      />
    </div>
  );
}

// ── Set Target Dialog ──────────────────────────────────────────────────────────

function SetTargetDialog({
  open, onOpenChange, userId, profiles, existing, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  profiles: any[];
  existing: KpiTarget | null;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    calls_per_day: "0",
    emails_per_day: "0",
    lines_per_day: "0",
    meetings_per_week: "0",
    quotations_per_month: "0",
    pos_per_month: "0",
    revenue_target: "0",
  });

  const profile = profiles.find((p) => p.id === userId);

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setForm({
        calls_per_day: String(existing.calls_per_day),
        emails_per_day: String(existing.emails_per_day),
        lines_per_day: String(existing.lines_per_day),
        meetings_per_week: String(existing.meetings_per_week),
        quotations_per_month: String(existing.quotations_per_month),
        pos_per_month: String(existing.pos_per_month),
        revenue_target: String(existing.revenue_target),
      });
    } else {
      setForm({ calls_per_day: "0", emails_per_day: "0", lines_per_day: "0", meetings_per_week: "0", quotations_per_month: "0", pos_per_month: "0", revenue_target: "0" });
    }
  }, [open, existing]);

  const save = async () => {
    if (!userId) { toast.error("กรุณาเลือกพนักงาน"); return; }
    setSaving(true);
    const payload = {
      user_id: userId,
      calls_per_day:        parseInt(form.calls_per_day) || 0,
      emails_per_day:       parseInt(form.emails_per_day) || 0,
      lines_per_day:        parseInt(form.lines_per_day) || 0,
      meetings_per_week:    parseInt(form.meetings_per_week) || 0,
      quotations_per_month: parseInt(form.quotations_per_month) || 0,
      pos_per_month:        parseInt(form.pos_per_month) || 0,
      revenue_target:       parseFloat(form.revenue_target) || 0,
      set_by: user?.id,
    };
    const { error } = await crmDb().from("kpi_targets").upsert(payload, { onConflict: "user_id" });
    setSaving(false);
    if (error) { toast.error("บันทึกไม่สำเร็จ", { description: error.message }); return; }
    toast.success("บันทึกเป้าหมายแล้ว");
    onSaved();
  };

  const fields = [
    { key: "calls_per_day",        label: "โทรต่อวัน",          icon: <Phone className="h-3.5 w-3.5" />, unit: "ครั้ง/วัน" },
    { key: "emails_per_day",       label: "Email ต่อวัน",        icon: <Mail className="h-3.5 w-3.5" />, unit: "ครั้ง/วัน" },
    { key: "lines_per_day",        label: "Line ต่อวัน",         icon: <MessageCircle className="h-3.5 w-3.5" />, unit: "ครั้ง/วัน" },
    { key: "meetings_per_week",    label: "เข้าพบต่อสัปดาห์",    icon: <Users className="h-3.5 w-3.5" />, unit: "ครั้ง/สัปดาห์" },
    { key: "quotations_per_month", label: "ใบเสนอราคาต่อเดือน",  icon: <FileText className="h-3.5 w-3.5" />, unit: "ใบ/เดือน" },
    { key: "pos_per_month",        label: "PO ต่อเดือน",         icon: <CheckCircle2 className="h-3.5 w-3.5" />, unit: "ใบ/เดือน" },
    { key: "revenue_target",       label: "Revenue เป้าหมาย",    icon: <TrendingUp className="h-3.5 w-3.5" />, unit: "บาท/เดือน" },
  ] as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            ตั้งเป้าหมาย KPI
            {profile && <span className="font-normal text-muted-foreground">— {profile.full_name}</span>}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          {fields.map(({ key, label, icon, unit }) => (
            <div key={key} className="flex items-center gap-3">
              <div className="flex w-40 items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                {icon} {label}
              </div>
              <Input
                type="number"
                min="0"
                className="h-9 text-sm"
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
              <span className="text-xs text-muted-foreground shrink-0 w-24">{unit}</span>
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              บันทึก
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
