// ⚠️ DO NOT auto-trigger any side effects
import { useState } from "react";
import { Mail, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { inviteCrmUser } from "@/lib/invite-user.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CRM_ROLES = ["sales", "manager", "admin"] as const;
type CrmRole = typeof CRM_ROLES[number];

const ROLE_LABEL: Record<CrmRole, string> = {
  sales: "Sales",
  manager: "Manager",
  admin: "Admin",
};

const ROLE_DESC: Record<CrmRole, string> = {
  sales: "ดูและจัดการดีลของตัวเอง",
  manager: "ดูดีลทั้งหมด + Dashboard",
  admin: "จัดการทีมและตั้งค่าระบบ",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onInvited: () => void;
}

export function InviteUserModal({ open, onOpenChange, onInvited }: Props) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CrmRole>("sales");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const invite = useServerFn(inviteCrmUser);

  const reset = () => { setEmail(""); setRole("sales"); setFullName(""); };

  const submit = async () => {
    if (!email.trim()) { toast.error("กรุณากรอก email"); return; }
    setBusy(true);
    try {
      const res = await invite({ data: { email: email.trim(), role, full_name: fullName.trim() || null } });
      if (res.resent) {
        toast.success(`ส่งลิงก์ reset password ไปยัง ${res.email} แล้ว`, { description: "email นี้มีบัญชีอยู่แล้ว" });
      } else {
        toast.success(`ส่งคำเชิญไปยัง ${res.email} แล้ว`);
      }
      reset();
      onInvited();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> เชิญผู้ใช้ใหม่
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div>
            <Label className="text-xs">Email <span className="text-red-500">*</span></Label>
            <Input
              type="email"
              placeholder="user@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <div>
            <Label className="text-xs">ชื่อ-นามสกุล (optional)</Label>
            <Input
              placeholder="ชื่อพนักงาน"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">บทบาท <span className="text-red-500">*</span></Label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {CRM_ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex flex-col items-start rounded-lg border p-3 text-left transition-colors ${
                    role === r
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <span className="text-sm font-medium">{ROLE_LABEL[r]}</span>
                  <span className="mt-0.5 text-[10px] text-muted-foreground leading-tight">{ROLE_DESC[r]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => { reset(); onOpenChange(false); }}>
              ยกเลิก
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Mail className="mr-1.5 h-4 w-4" />}
              {busy ? "กำลังส่ง…" : "ส่งคำเชิญ"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
