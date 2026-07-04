// KPI Template Manager
// Manager creates/edits templates, then applies them to one or multiple salespeople
import { useEffect, useState } from "react";
import {
  Plus, Edit2, Trash2, Loader2, Save, X, Users, ChevronDown,
  Phone, Mail, MessageCircle, UserPlus, FileText, CheckCircle2, TrendingUp, Trophy, Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";
import { formatBaht } from "@/lib/format";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Template {
  id: string;
  name: string;
  description: string | null;
  calls_per_day: number;
  emails_per_day: number;
  lines_per_day: number;
  meetings_per_week: number;
  quotations_per_month: number;
  pos_per_month: number;
  revenue_target: number;
  won_deals_target: number;
  new_accounts_target: number;
  created_at: string;
}

const BLANK_FORM = {
  name: "", description: "",
  calls_per_day: "0", emails_per_day: "0", lines_per_day: "0",
  meetings_per_week: "0", quotations_per_month: "0", pos_per_month: "0",
  revenue_target: "0", won_deals_target: "0", new_accounts_target: "0",
};

const FIELDS = [
  { key: "calls_per_day",        label: "โทรต่อวัน",              icon: Phone,         unit: "ครั้ง/วัน",     group: "daily" },
  { key: "emails_per_day",       label: "Email ต่อวัน",            icon: Mail,          unit: "ครั้ง/วัน",     group: "daily" },
  { key: "lines_per_day",        label: "Line ต่อวัน",             icon: MessageCircle, unit: "ครั้ง/วัน",     group: "daily" },
  { key: "meetings_per_week",    label: "เข้าพบต่อสัปดาห์",        icon: Users,         unit: "ครั้ง/สัปดาห์", group: "weekly" },
  { key: "quotations_per_month", label: "ใบเสนอราคาต่อเดือน",      icon: FileText,      unit: "ใบ/เดือน",     group: "monthly" },
  { key: "pos_per_month",        label: "PO ต่อเดือน",             icon: CheckCircle2,  unit: "ใบ/เดือน",     group: "monthly" },
  { key: "revenue_target",       label: "Revenue เป้าหมาย",        icon: TrendingUp,    unit: "บาท/เดือน",    group: "monthly" },
  { key: "won_deals_target",     label: "Won deals เป้าหมาย",      icon: Trophy,        unit: "ดีล/เดือน",    group: "monthly" },
  { key: "new_accounts_target",  label: "ลูกค้าใหม่เป้าหมาย",      icon: UserPlus,      unit: "ราย/เดือน",    group: "monthly" },
] as const;

// ── Template card ─────────────────────────────────────────────────────────────

function TemplateCard({ t, onEdit, onDelete, onApply }: {
  t: Template;
  onEdit: () => void;
  onDelete: () => void;
  onApply: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">{t.name}</div>
          {t.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</div>}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} title="แก้ไข">
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-600" onClick={onDelete} title="ลบ">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Preview chips */}
      <div className="flex flex-wrap gap-1.5">
        {[
          { label: `โทร ${t.calls_per_day}/วัน`,        show: t.calls_per_day > 0 },
          { label: `Email ${t.emails_per_day}/วัน`,      show: t.emails_per_day > 0 },
          { label: `Line ${t.lines_per_day}/วัน`,        show: t.lines_per_day > 0 },
          { label: `พบ ${t.meetings_per_week}/สัปดาห์`,  show: t.meetings_per_week > 0 },
          { label: `QT ${t.quotations_per_month}/เดือน`, show: t.quotations_per_month > 0 },
          { label: `PO ${t.pos_per_month}/เดือน`,        show: t.pos_per_month > 0 },
          { label: formatBaht(t.revenue_target),         show: t.revenue_target > 0 },
          { label: `Won ${t.won_deals_target} ดีล`,      show: t.won_deals_target > 0 },
          { label: `ลูกค้าใหม่ ${t.new_accounts_target}`, show: t.new_accounts_target > 0 },
        ].filter(c => c.show).map((c, i) => (
          <span key={i} className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {c.label}
          </span>
        ))}
      </div>

      <Button size="sm" className="w-full gap-1.5" onClick={onApply}>
        <Copy className="h-3.5 w-3.5" /> Apply ให้พนักงาน
      </Button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function KpiTemplateManager() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [profiles,  setProfiles]  = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);

  const [formOpen,   setFormOpen]   = useState(false);
  const [applyOpen,  setApplyOpen]  = useState(false);
  const [editTarget, setEditTarget] = useState<Template | null>(null);
  const [applyTpl,   setApplyTpl]   = useState<Template | null>(null);

  const load = async () => {
    setLoading(true);
    const [tRes, pRes] = await Promise.all([
      crmDb().from("kpi_templates").select("*").order("name"),
      crmDb().from("user_profiles").select("id,full_name,role,is_active").eq("is_active", true),
    ]);
    setTemplates((tRes.data ?? []) as Template[]);
    setProfiles((pRes.data ?? []).filter((p: any) => p.role === "sales" || p.role === "manager"));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const deleteTemplate = async (id: string) => {
    const _ok = await confirm({ title: "ลบ template นี้?", variant: "danger" });
    if (!_ok) return;
    const { error } = await crmDb().from("kpi_templates").delete().eq("id", id);
    if (error) { toast.error("ลบไม่สำเร็จ"); return; }
    toast.success("ลบ template แล้ว");
    load();
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">KPI Templates</h2>
          <p className="text-xs text-muted-foreground">สร้าง template แล้ว apply ให้พนักงานได้ทันที</p>
        </div>
        <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true); }}>
          <Plus className="mr-1.5 h-4 w-4" /> สร้าง Template
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          <Copy className="mx-auto mb-2 h-8 w-8 opacity-30" />
          ยังไม่มี template — กด "สร้าง Template" เพื่อเริ่ม
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              t={t}
              onEdit={() => { setEditTarget(t); setFormOpen(true); }}
              onDelete={() => deleteTemplate(t.id)}
              onApply={() => { setApplyTpl(t); setApplyOpen(true); }}
            />
          ))}
        </div>
      )}

      {/* Form dialog */}
      <TemplateFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editTarget}
        onSaved={() => { setFormOpen(false); load(); }}
      />

      {/* Apply dialog */}
      <ApplyTemplateDialog
        open={applyOpen}
        onOpenChange={setApplyOpen}
        template={applyTpl}
        profiles={profiles}
        onApplied={() => { setApplyOpen(false); toast.success("Apply template แล้ว"); }}
      />
    </div>
  );
}

// ── Template form dialog ──────────────────────────────────────────────────────

function TemplateFormDialog({ open, onOpenChange, initial, onSaved }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: Template | null;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const isEdit = !!initial;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        name: initial.name, description: initial.description ?? "",
        calls_per_day: String(initial.calls_per_day),
        emails_per_day: String(initial.emails_per_day),
        lines_per_day: String(initial.lines_per_day),
        meetings_per_week: String(initial.meetings_per_week),
        quotations_per_month: String(initial.quotations_per_month),
        pos_per_month: String(initial.pos_per_month),
        revenue_target: String(initial.revenue_target),
        won_deals_target: String(initial.won_deals_target),
        new_accounts_target: String(initial.new_accounts_target),
      });
    } else {
      setForm(BLANK_FORM);
    }
  }, [open, initial]);

  const save = async () => {
    if (!form.name.trim()) { toast.error("กรุณาตั้งชื่อ template"); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      calls_per_day: parseInt(form.calls_per_day) || 0,
      emails_per_day: parseInt(form.emails_per_day) || 0,
      lines_per_day: parseInt(form.lines_per_day) || 0,
      meetings_per_week: parseInt(form.meetings_per_week) || 0,
      quotations_per_month: parseInt(form.quotations_per_month) || 0,
      pos_per_month: parseInt(form.pos_per_month) || 0,
      revenue_target: parseFloat(form.revenue_target) || 0,
      won_deals_target: parseInt(form.won_deals_target) || 0,
      new_accounts_target: parseInt(form.new_accounts_target) || 0,
      created_by: user?.id,
    };
    let error;
    if (isEdit && initial) {
      ({ error } = await crmDb().from("kpi_templates").update(payload).eq("id", initial.id));
    } else {
      ({ error } = await crmDb().from("kpi_templates").insert(payload));
    }
    setSaving(false);
    if (error) { toast.error("บันทึกไม่สำเร็จ", { description: error.message }); return; }
    toast.success(isEdit ? "แก้ไข template แล้ว" : "สร้าง template แล้ว");
    onSaved();
  };

  const groups = [
    { label: "กิจกรรมรายวัน", keys: ["calls_per_day", "emails_per_day", "lines_per_day"] },
    { label: "กิจกรรมรายสัปดาห์", keys: ["meetings_per_week"] },
    { label: "เป้าหมายรายเดือน", keys: ["quotations_per_month", "pos_per_month", "revenue_target", "won_deals_target", "new_accounts_target"] },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "แก้ไข Template" : "สร้าง KPI Template"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div>
            <Label className="text-xs">ชื่อ Template <span className="text-red-500">*</span></Label>
            <Input placeholder="เช่น Senior Sales, Junior, Team A"
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">คำอธิบาย (optional)</Label>
            <Textarea rows={2} placeholder="รายละเอียดเพิ่มเติม"
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          {groups.map(({ label, keys }) => (
            <div key={label} className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</div>
              <div className="grid grid-cols-2 gap-2">
                {keys.map((k) => {
                  const f = FIELDS.find(f => f.key === k)!;
                  const Icon = f.icon;
                  return (
                    <div key={k} className="space-y-1">
                      <Label className="text-[11px] flex items-center gap-1 text-muted-foreground">
                        <Icon className="h-3 w-3" /> {f.label}
                      </Label>
                      <div className="flex items-center gap-1">
                        <Input type="number" min="0" className="h-8 text-sm"
                          value={form[k as keyof typeof form]}
                          onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                        <span className="text-[10px] text-muted-foreground shrink-0">{f.unit.split("/")[1]}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {isEdit ? "บันทึก" : "สร้าง"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Apply template dialog ─────────────────────────────────────────────────────

function ApplyTemplateDialog({ open, onOpenChange, template, profiles, onApplied }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  template: Template | null;
  profiles: any[];
  onApplied: () => void;
}) {
  const { user } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applyMonthly, setApplyMonthly] = useState(true);
  const [applyDaily,   setApplyDaily]   = useState(true);
  const [saving, setSaving] = useState(false);

  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);

  const toggle = (uid: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(profiles.map(p => p.id)));
  const clearAll  = () => setSelected(new Set());

  const apply = async () => {
    if (selected.size === 0 || !template) { toast.error("เลือกพนักงานอย่างน้อย 1 คน"); return; }
    setSaving(true);
    let errors = 0;

    for (const uid of selected) {
      // Apply daily/weekly targets
      if (applyDaily) {
        const { error } = await crmDb().from("kpi_targets").upsert({
          user_id: uid,
          calls_per_day:        template.calls_per_day,
          emails_per_day:       template.emails_per_day,
          lines_per_day:        template.lines_per_day,
          meetings_per_week:    template.meetings_per_week,
          quotations_per_month: template.quotations_per_month,
          pos_per_month:        template.pos_per_month,
          revenue_target:       template.revenue_target,
          set_by: user?.id,
        }, { onConflict: "user_id" });
        if (error) errors++;
      }

      // Apply monthly targets
      if (applyMonthly) {
        const { error } = await crmDb().from("kpi_monthly_targets").upsert({
          user_id: uid, year, month,
          revenue_target:      template.revenue_target,
          won_deals_target:    template.won_deals_target,
          new_accounts_target: template.new_accounts_target,
          note: `จาก template: ${template.name}`,
          set_by: user?.id,
        }, { onConflict: "user_id,year,month" });
        if (error) errors++;
      }
    }

    setSaving(false);
    if (errors > 0) toast.warning(`Apply แล้ว (มี ${errors} error)`);
    else onApplied();
  };

  const MONTH_TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-4 w-4 text-primary" />
            Apply Template
            <Badge variant="secondary" className="text-xs">{template.name}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">

          {/* Template summary */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
            <div className="text-xs font-semibold text-muted-foreground">KPI ที่จะ apply</div>
            <div className="flex flex-wrap gap-1.5">
              {[
                template.calls_per_day > 0      && `โทร ${template.calls_per_day}/วัน`,
                template.emails_per_day > 0     && `Email ${template.emails_per_day}/วัน`,
                template.meetings_per_week > 0  && `พบ ${template.meetings_per_week}/สัปดาห์`,
                template.revenue_target > 0     && formatBaht(template.revenue_target),
                template.won_deals_target > 0   && `Won ${template.won_deals_target} ดีล`,
                template.new_accounts_target > 0 && `ลูกค้าใหม่ ${template.new_accounts_target}`,
              ].filter(Boolean).map((l, i) => (
                <span key={i} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{l as string}</span>
              ))}
            </div>
          </div>

          {/* Apply scope */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground">Apply ไปที่</div>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={applyDaily} onCheckedChange={(v) => setApplyDaily(!!v)} />
                <span className="text-sm">เป้าหมายรายวัน/สัปดาห์ (kpi_targets)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={applyMonthly} onCheckedChange={(v) => setApplyMonthly(!!v)} />
                <div className="flex items-center gap-2">
                  <span className="text-sm">เป้าหมายรายเดือน</span>
                  {applyMonthly && (
                    <select
                      className="rounded border bg-background px-2 py-1 text-xs"
                      value={`${year}-${month}`}
                      onChange={(e) => {
                        const [y, m] = e.target.value.split("-").map(Number);
                        setYear(y); setMonth(m);
                      }}
                    >
                      {[-1, 0, 1, 2].map((offset) => {
                        const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
                        const y = d.getFullYear(); const m = d.getMonth() + 1;
                        return (
                          <option key={`${y}-${m}`} value={`${y}-${m}`}>
                            {MONTH_TH[m - 1]} {y + 543}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>
              </label>
            </div>
          </div>

          {/* People selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-muted-foreground">
                เลือกพนักงาน ({selected.size}/{profiles.length})
              </div>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-[11px] text-primary hover:underline">เลือกทั้งหมด</button>
                <button onClick={clearAll}  className="text-[11px] text-muted-foreground hover:underline">ล้าง</button>
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
              {profiles.map((p) => {
                const initials = (p.full_name ?? "?").split(" ").map((s: string) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
                const checked = selected.has(p.id);
                return (
                  <label key={p.id} className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/40 ${checked ? "bg-primary/5" : ""}`}>
                    <Checkbox checked={checked} onCheckedChange={() => toggle(p.id)} />
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="bg-primary/10 text-[10px] text-primary">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{p.full_name ?? "—"}</div>
                      <div className="text-[10px] text-muted-foreground capitalize">{p.role}</div>
                    </div>
                    {checked && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
            <Button onClick={apply} disabled={saving || selected.size === 0}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Apply ให้ {selected.size} คน
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
