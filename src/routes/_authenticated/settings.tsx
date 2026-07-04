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
import { Plus } from "lucide-react";

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
