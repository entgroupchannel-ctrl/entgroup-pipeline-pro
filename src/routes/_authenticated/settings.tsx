import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { crmDb, ACTIVE_STAGES, OUTCOME_STAGES, STAGE_LABEL_TH, type LeadStage, type UserProfile } from "@/lib/crm";
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABEL, type ActivityType } from "@/lib/activities";
import { Plus, UserPlus } from "lucide-react";
import { InviteUserModal } from "@/components/InviteUserModal";
import { FlowAccountTab } from "@/components/settings/FlowAccountTab";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const isManager = role === "manager" || role === "admin";
  return (
    <div className="p-6 page-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">ตั้งค่า</h1>
        <p className="text-xs text-muted-foreground">จัดการโปรไฟล์ ทีม และการแสดงผล</p>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList>
          <TabsTrigger value="profile">โปรไฟล์</TabsTrigger>
          {isAdmin && <TabsTrigger value="team">ทีมขาย</TabsTrigger>}
          <TabsTrigger value="stages">Pipeline Stages</TabsTrigger>
          {isManager && <TabsTrigger value="script">Sales Script</TabsTrigger>}
          {isAdmin && <TabsTrigger value="flowaccount">FlowAccount</TabsTrigger>}
        </TabsList>

        <TabsContent value="profile" className="mt-6 max-w-lg">
          <ProfileTab />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="team" className="mt-6">
            <TeamTab />
          </TabsContent>
        )}
        <TabsContent value="stages" className="mt-6 max-w-lg">
          <StagesTab />
        </TabsContent>
        {isManager && (
          <TabsContent value="script" className="mt-6">
            <SalesScriptTab />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="flowaccount" className="mt-6">
            <FlowAccountTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function ProfileTab() {
  const { user, profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setName(profile?.full_name ?? ""); }, [profile?.full_name]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await crmDb().from("user_profiles").update({ full_name: name }).eq("id", user.id);
    setSaving(false);
    if (error) return toast.error("บันทึกไม่สำเร็จ", { description: error.message });
    await refreshProfile();
    toast.success("บันทึกแล้ว");
  };

  return (
    <div className="space-y-5 rounded-xl border bg-card p-5">
      <div className="space-y-2">
        <Label>อีเมล</Label>
        <Input value={user?.email ?? ""} disabled />
      </div>
      <div className="space-y-2">
        <Label>ชื่อ-นามสกุล</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>บทบาท</Label>
        <Badge variant="secondary" className="text-xs capitalize">{profile?.role ?? "-"}</Badge>
      </div>
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          บันทึก
        </Button>
      </div>
    </div>
  );
}

function TeamTab() {
  const [rows, setRows] = useState<UserProfile[] | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = async () => {
    const { data } = await crmDb().from("user_profiles").select("*").order("full_name");
    setRows((data ?? []) as UserProfile[]);
  };
  useEffect(() => { load(); }, []);

  const updateRow = async (id: string, patch: Partial<UserProfile>) => {
    const { error } = await crmDb().from("user_profiles").update(patch).eq("id", id);
    if (error) return toast.error("อัปเดตไม่สำเร็จ", { description: error.message });
    toast.success("อัปเดตแล้ว");
    load();
  };

  if (!rows) {
    return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{rows.length} ผู้ใช้</p>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <UserPlus className="mr-1.5 h-4 w-4" /> เชิญผู้ใช้
        </Button>
      </div>
      <div className="rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="px-4 py-3 font-medium">ชื่อ</th>
            <th className="px-4 py-3 font-medium">บทบาท</th>
            <th className="px-4 py-3 font-medium">สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={3} className="py-6 text-center text-xs text-muted-foreground">ยังไม่มีผู้ใช้</td></tr>
          )}
          {rows.map((u) => (
            <tr key={u.id} className="border-b last:border-0">
              <td className="px-4 py-3 font-medium">{u.full_name ?? "-"}</td>
              <td className="px-4 py-3">
                <Select value={u.role} onValueChange={(v) => updateRow(u.id, { role: v as any })}>
                  <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sales">Sales</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Switch checked={u.is_active} onCheckedChange={(v) => updateRow(u.id, { is_active: v })} />
                  <span className="text-xs text-muted-foreground">{u.is_active ? "ใช้งาน" : "ปิด"}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
      <InviteUserModal open={inviteOpen} onOpenChange={setInviteOpen} onInvited={load} />
    </>
  );
}

function StagesTab() {
  const stages = [...ACTIVE_STAGES, ...OUTCOME_STAGES];
  return (
    <div className="space-y-2 rounded-xl border bg-card p-5">
      <p className="mb-3 text-xs text-muted-foreground">Stage ในระบบ (ยังไม่รองรับการแก้ไขในเฟสนี้)</p>
      {stages.map((s) => (
        <div key={s} className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
          <span className={`h-3 w-3 rounded-full stage-dot-${s}`} />
          <span className="text-sm font-medium">{STAGE_LABEL_TH[s]}</span>
          <span className="ml-auto text-xs text-muted-foreground">{s}</span>
        </div>
      ))}
    </div>
  );
}

interface Template {
  id: string;
  stage: string;
  step_order: number;
  activity_type: string;
  subject: string;
  body_template: string | null;
  due_hours: number;
  is_active: boolean;
}

function SalesScriptTab() {
  const [rows, setRows] = useState<Template[] | null>(null);
  const [editing, setEditing] = useState<Record<string, { subject: string; due_hours: number }>>({});

  const load = async () => {
    const { data, error } = await crmDb()
      .from("activity_templates")
      .select("*")
      .order("stage")
      .order("step_order");
    if (error) return toast.error("โหลดไม่สำเร็จ", { description: error.message });
    setRows((data ?? []) as Template[]);
  };
  useEffect(() => { load(); }, []);

  const saveRow = async (id: string) => {
    const patch = editing[id];
    if (!patch) return;
    const { error } = await crmDb().from("activity_templates").update(patch).eq("id", id);
    if (error) return toast.error("บันทึกไม่สำเร็จ", { description: error.message });
    toast.success("บันทึกแล้ว");
    setEditing((e) => { const n = { ...e }; delete n[id]; return n; });
    load();
  };

  const toggleActive = async (t: Template) => {
    const { error } = await crmDb().from("activity_templates").update({ is_active: !t.is_active }).eq("id", t.id);
    if (error) return toast.error("อัปเดตไม่สำเร็จ", { description: error.message });
    load();
  };

  const addStep = async (stage: string) => {
    const inStage = (rows ?? []).filter((r) => r.stage === stage);
    const nextOrder = inStage.length ? Math.max(...inStage.map((r) => r.step_order)) + 1 : 1;
    const { error } = await crmDb().from("activity_templates").insert({
      stage,
      step_order: nextOrder,
      activity_type: "call",
      subject: "งานใหม่",
      due_hours: 24,
      is_active: true,
    });
    if (error) return toast.error("เพิ่มไม่สำเร็จ", { description: error.message });
    load();
  };

  if (!rows) {
    return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const allStages = [...ACTIVE_STAGES, ...OUTCOME_STAGES];
  const byStage: Record<string, Template[]> = {};
  for (const s of allStages) byStage[s] = [];
  for (const r of rows) {
    if (!byStage[r.stage]) byStage[r.stage] = [];
    byStage[r.stage].push(r);
  }

  return (
    <div className="space-y-5">
      {allStages.map((stage) => {
        const list = byStage[stage] ?? [];
        return (
          <div key={stage} className="rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`stage-badge-${stage as LeadStage} text-[10px]`}>
                  {STAGE_LABEL_TH[stage as LeadStage]}
                </Badge>
                <span className="text-xs text-muted-foreground">{list.length} step</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => addStep(stage)}>
                <Plus className="mr-1 h-4 w-4" /> เพิ่ม step
              </Button>
            </div>
            {list.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">ยังไม่มี step</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">#</th>
                    <th className="px-4 py-2 font-medium">ประเภท</th>
                    <th className="px-4 py-2 font-medium">หัวข้อ</th>
                    <th className="px-4 py-2 font-medium">กำหนด (ชม.)</th>
                    <th className="px-4 py-2 font-medium">ใช้งาน</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((t) => {
                    const draft = editing[t.id];
                    const isEditing = !!draft;
                    return (
                      <tr key={t.id} className="border-b last:border-0">
                        <td className="px-4 py-2 text-xs text-muted-foreground">{t.step_order}</td>
                        <td className="px-4 py-2 text-xs">
                          {ACTIVITY_TYPE_LABEL[t.activity_type as ActivityType] ?? t.activity_type}
                        </td>
                        <td className="px-4 py-2">
                          {isEditing ? (
                            <Input
                              className="h-8"
                              value={draft.subject}
                              onChange={(e) => setEditing((s) => ({ ...s, [t.id]: { ...draft, subject: e.target.value } }))}
                            />
                          ) : (
                            <button
                              onClick={() => setEditing((s) => ({ ...s, [t.id]: { subject: t.subject, due_hours: t.due_hours } }))}
                              className="text-left text-sm hover:underline"
                            >
                              {t.subject}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {isEditing ? (
                            <Input
                              type="number"
                              className="h-8 w-20"
                              value={draft.due_hours}
                              onChange={(e) => setEditing((s) => ({ ...s, [t.id]: { ...draft, due_hours: Number(e.target.value) } }))}
                            />
                          ) : (
                            <span className="text-xs">{t.due_hours}</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <Switch checked={t.is_active} onCheckedChange={() => toggleActive(t)} />
                        </td>
                        <td className="px-4 py-2 text-right">
                          {isEditing && (
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => setEditing((s) => { const n = { ...s }; delete n[t.id]; return n; })}>ยกเลิก</Button>
                              <Button size="sm" onClick={() => saveRow(t.id)}>บันทึก</Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
      {/* Suppress unused warning */}
      <span className="hidden">{ACTIVITY_TYPES.length}</span>
    </div>
  );
}

