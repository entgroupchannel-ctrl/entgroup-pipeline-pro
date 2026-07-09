import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { crmDb, ACTIVE_STAGES, OUTCOME_STAGES, STAGE_LABEL_TH, type LeadStage, type UserProfile } from "@/lib/crm";
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABEL, type ActivityType } from "@/lib/activities";
import { Plus, UserPlus, Trash2, Mail } from "lucide-react";
import { InviteUserModal } from "@/components/InviteUserModal";
import { FlowAccountTab } from "@/components/settings/FlowAccountTab";
import { EmailConfigTab } from "@/components/settings/EmailConfigTab";
import { LineOATab } from "@/components/settings/LineOATab";
import { AISettingsTab } from "@/components/settings/AISettingsTab";
import { PermissionsTab } from "@/components/settings/PermissionsTab";
import { EmailTemplatesTab } from "@/components/settings/EmailTemplatesTab";
import { MediaLibraryTab } from "@/components/settings/MediaLibraryTab";
import { deactivateCrmUser, listCrmUsersWithEmail, resendCrmInvite, updateCrmUserName } from "@/lib/invite-user.functions";
import { useConfirm } from "@/components/ui/confirm-dialog";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const isManager = role === "manager" || role === "admin";
  const [active, setActive] = useState("profile");

  // Sales role can only access "profile" tab — block all others
  // (sidebar already hides the link, but guard direct URL access too)
  if (role === "sales" && active !== "profile") {
    // If someone manually changes tab via URL hack, reset to profile
    setTimeout(() => setActive("profile"), 0);
  }

  // Menu groups definition
  type MenuItem = { key: string; label: string; adminOnly?: boolean; managerOnly?: boolean };
  type MenuGroup = { group: string; items: MenuItem[] };

  const menuGroups: MenuGroup[] = [
    {
      group: "บัญชีและทีม",
      items: [
        { key: "profile", label: "โปรไฟล์ของฉัน" },
        { key: "team", label: "ทีมขาย", adminOnly: true },
        { key: "permissions", label: "สิทธิ์การใช้งาน", adminOnly: true },
      ],
    },
    {
      group: "Pipeline และการขาย",
      items: [
        { key: "stages", label: "Pipeline Stages" },
        { key: "script", label: "Sales Script", managerOnly: true },
      ],
    },
    {
      group: "อีเมล",
      items: [
        { key: "email", label: "ตั้งค่า Email (Resend)", adminOnly: true },
        { key: "email_templates", label: "Email Templates" },
        { key: "media", label: "Media Library", adminOnly: true },
      ],
    },
    {
      group: "การตั้งค่า API",
      items: [
        { key: "flowaccount", label: "FlowAccount", adminOnly: true },
        { key: "line", label: "LINE OA", adminOnly: true },
        { key: "ai", label: "AI ✦", adminOnly: true },
      ],
    },
  ];

  // Filter items by role
  const isSales = role === "sales";

  const visibleGroups = menuGroups.map((g) => ({
    ...g,
    items: g.items.filter((item) => {
      if (item.adminOnly && !isAdmin) return false;
      if (item.managerOnly && !isManager) return false;
      if (isSales && (item as any).key !== "profile") return false; // sales: profile only
      return true;
    }),
  })).filter((g) => g.items.length > 0);

  // If sales tries to access non-profile tab (e.g. via URL manipulation)
  const effectiveActive = isSales ? "profile" : active;

  const CONTENT: Record<string, React.ReactNode> = {
    profile:         <ProfileTab />,
    team:            isAdmin ? <TeamTab /> : null,
    permissions:     isAdmin ? <PermissionsTab /> : null,
    stages:          <StagesTab />,
    script:          isManager ? <SalesScriptTab /> : null,
    email:           isAdmin ? <EmailConfigTab /> : null,
    email_templates: <EmailTemplatesTab />,
    media:           isAdmin ? <MediaLibraryTab /> : null,
    flowaccount:     isAdmin ? <FlowAccountTab /> : null,
    line:            isAdmin ? <LineOATab /> : null,
    ai:              isAdmin ? <AISettingsTab /> : null,
  };

  const activeLabel = visibleGroups.flatMap((g) => g.items).find((i) => i.key === effectiveActive)?.label ?? "";

  return (
    <div className="flex h-full page-fade-in">

      {/* ── Sidebar ── */}
      <div className="w-56 shrink-0 border-r bg-muted/20 overflow-y-auto">
        <div className="px-4 py-5 border-b">
          <h1 className="text-sm font-semibold">ตั้งค่า</h1>
        </div>
        <nav className="py-3 space-y-4 px-2">
          {visibleGroups.map((g) => (
            <div key={g.group}>
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {g.group}
              </p>
              {g.items.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setActive(item.key)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                    effectiveActive === item.key
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span>{item.label}</span>
                  {effectiveActive === item.key && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-5 border-b pb-4">
          <h2 className="text-lg font-semibold">{activeLabel}</h2>
        </div>
        <div className="max-w-3xl">
          {CONTENT[effectiveActive] ?? (
            isSales ? <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-6 text-sm text-amber-700 dark:text-amber-400">ไม่มีสิทธิ์เข้าถึงส่วนนี้</div> : null
          )}
        </div>
      </div>
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
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<Record<string, string | null>>({}); // userId -> draft name
  const { user } = useAuth();
  const confirm = useConfirm();
  const deactivate = useServerFn(deactivateCrmUser);
  const fetchUsers = useServerFn(listCrmUsersWithEmail);
  const resend = useServerFn(resendCrmInvite);
  const updateName = useServerFn(updateCrmUserName);

  const load = async () => {
    try {
      const data = await fetchUsers();
      setRows((data ?? []) as UserProfile[]);
    } catch {
      // fallback: fetch without email if server fn fails
      const { data } = await crmDb().from("user_profiles").select("*").order("full_name");
      setRows((data ?? []) as UserProfile[]);
    }
  };
  useEffect(() => { load(); }, []);

  const updateRow = async (id: string, patch: Partial<UserProfile>) => {
    const { error } = await crmDb().from("user_profiles").update(patch).eq("id", id);
    if (error) return toast.error("อัปเดตไม่สำเร็จ", { description: error.message });
    toast.success("อัปเดตแล้ว");
    load();
  };

  const startEditName = (u: UserProfile) => {
    setEditingName((prev) => ({ ...prev, [u.id]: u.full_name ?? "" }));
  };

  const cancelEditName = (id: string) => {
    setEditingName((prev) => { const n = { ...prev }; delete n[id]; return n; });
  };

  const saveNameFor = async (u: UserProfile) => {
    const draft = editingName[u.id];
    if (draft === undefined) return;
    const trimmed = (draft ?? "").trim() || null;
    try {
      await updateName({ data: { user_id: u.id, full_name: trimmed } });
      toast.success("บันทึกชื่อแล้ว");
      cancelEditName(u.id);
      load();
    } catch (err: any) {
      toast.error("บันทึกชื่อไม่สำเร็จ", { description: err?.message ?? "ลองใหม่อีกครั้ง" });
    }
  };

  const handleResend = async (u: UserProfile) => {
    const confirmed = await confirm({
      title: `ส่งลิงก์เชิญใหม่ให้ ${u.full_name ?? u.email ?? "ผู้ใช้"}?`,
      confirmLabel: "ส่งเลย",
      cancelLabel: "ยกเลิก",
    });
    if (!confirmed) return;
    setResendingId(u.id);
    try {
      const res = await resend({ data: { user_id: u.id } });
      toast.success(`ส่งลิงก์ใหม่ไปยัง ${res.email} แล้ว`, {
        description: "ลิงก์มีอายุ 24 ชั่วโมง",
      });
    } catch (err: any) {
      toast.error("ส่งลิงก์ไม่สำเร็จ", { description: err?.message ?? "ลองใหม่อีกครั้ง" });
    } finally {
      setResendingId(null);
    }
  };

  const handleDelete = async (u: UserProfile) => {
    if (u.id === user?.id) return;
    const confirmed = await confirm({
      title: `ยืนยันลบ ${u.full_name ?? u.email ?? "ผู้ใช้"} ออกจากระบบ?`,
      variant: "danger",
      confirmLabel: "ลบ",
      cancelLabel: "ยกเลิก",
    });
    if (!confirmed) return;
    try {
      await deactivate({ data: { user_id: u.id } });
      toast.success("ลบผู้ใช้แล้ว");
      load();
    } catch (err: any) {
      toast.error("ลบไม่สำเร็จ", { description: err?.message ?? "ลองใหม่อีกครั้ง" });
    }
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
            <th className="px-4 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={4} className="py-6 text-center text-xs text-muted-foreground">ยังไม่มีผู้ใช้</td></tr>
          )}
          {rows.map((u) => {
            const isSending = resendingId === u.id;
            const isEditingThisName = u.id in editingName;
            return (
            <tr key={u.id} className="border-b last:border-0">
              <td className="px-4 py-3">
                {isEditingThisName ? (
                  <div className="flex flex-col gap-1.5">
                    <Input
                      autoFocus
                      className="h-8 text-sm"
                      placeholder="ชื่อ-นามสกุลพนักงาน"
                      value={editingName[u.id] ?? ""}
                      onChange={(e) => setEditingName((prev) => ({ ...prev, [u.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveNameFor(u);
                        if (e.key === "Escape") cancelEditName(u.id);
                      }}
                    />
                    <div className="flex gap-1">
                      <Button size="sm" className="h-6 px-2 text-xs" onClick={() => saveNameFor(u)}>บันทึก</Button>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => cancelEditName(u.id)}>ยกเลิก</Button>
                    </div>
                    {u.email && (
                      <p className="text-[11px] text-muted-foreground">{u.email}</p>
                    )}
                  </div>
                ) : (
                  <div>
                    <button
                      className="group flex items-center gap-1.5 text-left"
                      title="คลิกเพื่อแก้ไขชื่อ"
                      onClick={() => startEditName(u)}
                    >
                      <p className="font-medium leading-tight group-hover:underline">
                        {u.full_name ?? <span className="text-muted-foreground italic">ยังไม่ตั้งชื่อ — คลิกเพื่อใส่ชื่อ</span>}
                      </p>
                      <span className="hidden group-hover:inline text-muted-foreground opacity-50">✏️</span>
                    </button>
                    {u.email && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{u.email}</p>
                    )}
                  </div>
                )}
              </td>
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
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  {user?.id !== u.id && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-primary"
                        onClick={() => handleResend(u)}
                        disabled={isSending}
                        title="ส่งลิงก์เชิญใหม่"
                      >
                        {isSending
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Mail className="h-3.5 w-3.5" />}
                        <span className="hidden sm:inline">ส่งลิงก์ใหม่</span>
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-red-600"
                        onClick={() => handleDelete(u)}
                        title="ลบผู้ใช้"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </td>
            </tr>
            );
          })}
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

