import { useEffect, useState } from "react";
import { Plus, Edit2, Trash2, Loader2, Save, X, Globe, User, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";

interface EmailTemplate {
  id: string;
  name: string;
  category: string;
  subject: string;
  body: string;
  is_system: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

const CATEGORIES = ["แนะนำองค์กร", "ใบเสนอราคา", "Follow Up", "สินค้าและบริการ", "โปรโมชัน", "ทั่วไป"];

const MERGE_TAGS = [
  { tag: "{{ชื่อผู้รับ}}", desc: "ชื่อผู้รับอีเมล" },
  { tag: "{{ชื่อบริษัท}}", desc: "ชื่อบริษัทผู้รับ" },
  { tag: "{{ชื่อผู้ส่ง}}", desc: "ชื่อ Sales ผู้ส่ง" },
  { tag: "{{เลขดีล}}", desc: "เลขที่ดีล/ใบเสนอราคา" },
  { tag: "{{มูลค่าดีล}}", desc: "มูลค่าดีล (บาท)" },
  { tag: "{{วันที่วันนี้}}", desc: "วันที่ปัจจุบัน" },
];

function TemplateForm({
  initial,
  onSave,
  onClose,
  isAdmin,
}: {
  initial: Partial<EmailTemplate> | null;
  onSave: () => void;
  onClose: () => void;
  isAdmin: boolean;
}) {
  const { user } = useAuth();
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "ทั่วไป");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [isSystem, setIsSystem] = useState(initial?.is_system ?? false);
  const [saving, setSaving] = useState(false);

  const insertTag = (tag: string) => {
    setBody((prev) => prev + tag);
  };

  const submit = async () => {
    if (!name.trim()) { toast.error("กรุณาระบุชื่อ template"); return; }
    if (!subject.trim()) { toast.error("กรุณาระบุหัวข้ออีเมล"); return; }
    if (!body.trim()) { toast.error("กรุณาระบุเนื้อหา"); return; }
    setSaving(true);
    const payload = { name: name.trim(), category, subject: subject.trim(), body: body.trim(), is_system: isAdmin ? isSystem : false };
    let error;
    if (initial?.id) {
      ({ error } = await crmDb().from("email_templates").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", initial.id));
    } else {
      ({ error } = await crmDb().from("email_templates").insert({ ...payload, created_by: user?.id }));
    }
    setSaving(false);
    if (error) { toast.error("บันทึกไม่สำเร็จ", { description: error.message }); return; }
    toast.success(initial?.id ? "แก้ไขแล้ว" : "สร้าง template แล้ว");
    onSave();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">ชื่อ Template <span className="text-red-500">*</span></Label>
          <Input placeholder="เช่น แนะนำ ENTGROUP" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">หมวดหมู่</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isAdmin && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
          <input type="checkbox" id="is_system" checked={isSystem} onChange={(e) => setIsSystem(e.target.checked)} className="h-3.5 w-3.5" />
          <label htmlFor="is_system" className="text-xs cursor-pointer">
            <span className="font-medium">Template กลาง (System)</span>
            <span className="text-muted-foreground ml-1">— ทุกคนในทีมเห็นและใช้งานได้</span>
          </label>
        </div>
      )}

      <div>
        <Label className="text-xs">หัวข้ออีเมล (Subject) <span className="text-red-500">*</span></Label>
        <Input placeholder="เช่น แนะนำบริการจาก ENTGROUP — {{ชื่อบริษัท}}" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs">เนื้อหา <span className="text-red-500">*</span></Label>
          <div className="flex flex-wrap gap-1">
            {MERGE_TAGS.map((m) => (
              <button
                key={m.tag}
                onClick={() => insertTag(m.tag)}
                title={m.desc}
                className="rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors font-mono"
              >
                {m.tag}
              </button>
            ))}
          </div>
        </div>
        <Textarea rows={10} placeholder="เนื้อหาอีเมล..." value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-xs" />
        <p className="mt-1 text-[10px] text-muted-foreground">คลิก tag ด้านบนเพื่อแทรก merge tag — ระบบจะแทนค่าอัตโนมัติเมื่อส่ง</p>
      </div>

      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
        <Button onClick={submit} disabled={saving}>
          {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          <Save className="mr-1.5 h-4 w-4" />
          {initial?.id ? "บันทึก" : "สร้าง Template"}
        </Button>
      </div>
    </div>
  );
}

export function EmailTemplatesTab() {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [catFilter, setCatFilter] = useState("ทั้งหมด");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [preview, setPreview] = useState<EmailTemplate | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await crmDb().from("email_templates").select("*").eq("is_active", true).order("is_system", { ascending: false }).order("category").order("name");
    if (error) { toast.error("โหลดไม่สำเร็จ"); }
    setTemplates((data ?? []) as EmailTemplate[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const deleteTemplate = async (t: EmailTemplate) => {
    if (!confirm(`ลบ "${t.name}" ?`)) return;
    const { error } = await crmDb().from("email_templates").update({ is_active: false }).eq("id", t.id);
    if (error) { toast.error("ลบไม่สำเร็จ"); return; }
    toast.success("ลบแล้ว");
    load();
  };

  const duplicateTemplate = async (t: EmailTemplate) => {
    const { error } = await crmDb().from("email_templates").insert({
      name: `${t.name} (สำเนา)`,
      category: t.category,
      subject: t.subject,
      body: t.body,
      is_system: false,
      created_by: user?.id,
    });
    if (error) { toast.error("คัดลอกไม่สำเร็จ"); return; }
    toast.success("คัดลอกเป็น template ส่วนตัวแล้ว");
    load();
  };

  const allCategories = ["ทั้งหมด", ...Array.from(new Set(templates.map((t) => t.category)))];
  const filtered = catFilter === "ทั้งหมด" ? templates : templates.filter((t) => t.category === catFilter);
  const systemTpls = filtered.filter((t) => t.is_system);
  const personalTpls = filtered.filter((t) => !t.is_system);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Email Templates</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{templates.length} templates · คลิกเพื่อดูตัวอย่าง</p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> สร้าง Template
        </Button>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        {allCategories.map((c) => (
          <button key={c} onClick={() => setCatFilter(c)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${catFilter === c ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-6">
          {/* System templates */}
          {systemTpls.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                <Globe className="h-3.5 w-3.5" /> Template กลาง (ทุกคนใช้ได้)
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {systemTpls.map((t) => (
                  <TemplateCard key={t.id} t={t} isAdmin={isAdmin} onEdit={() => { setEditing(t); setFormOpen(true); }} onDelete={() => deleteTemplate(t)} onDuplicate={() => duplicateTemplate(t)} onPreview={() => setPreview(t)} />
                ))}
              </div>
            </div>
          )}

          {/* Personal templates */}
          {personalTpls.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                <User className="h-3.5 w-3.5" /> Template ส่วนตัว
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {personalTpls.map((t) => (
                  <TemplateCard key={t.id} t={t} isAdmin={isAdmin} onEdit={() => { setEditing(t); setFormOpen(true); }} onDelete={() => deleteTemplate(t)} onDuplicate={() => duplicateTemplate(t)} onPreview={() => setPreview(t)} />
                ))}
              </div>
            </div>
          )}

          {filtered.length === 0 && (
            <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
              ยังไม่มี template ในหมวดนี้
            </div>
          )}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `แก้ไข: ${editing.name}` : "สร้าง Template ใหม่"}</DialogTitle>
          </DialogHeader>
          <TemplateForm initial={editing} onSave={() => { setFormOpen(false); load(); }} onClose={() => setFormOpen(false)} isAdmin={isAdmin} />
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {preview?.is_system ? <Globe className="h-4 w-4 text-blue-600" /> : <User className="h-4 w-4 text-emerald-600" />}
              {preview?.name}
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs">
                <span className="text-muted-foreground">Subject: </span>
                <span className="font-medium">{preview.subject}</span>
              </div>
              <div className="rounded-lg border bg-card px-4 py-3 text-xs whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                {preview.body}
              </div>
              <div className="flex justify-end gap-2 border-t pt-3">
                <Button variant="outline" size="sm" onClick={() => { duplicateTemplate(preview); setPreview(null); }}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> คัดลอกเป็นของฉัน
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>ปิด</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplateCard({ t, isAdmin, onEdit, onDelete, onDuplicate, onPreview }: {
  t: EmailTemplate; isAdmin: boolean;
  onEdit: () => void; onDelete: () => void; onDuplicate: () => void; onPreview: () => void;
}) {
  const canEdit = isAdmin || (!t.is_system);
  return (
    <div className="group flex flex-col gap-2 rounded-xl border bg-card p-3 hover:border-primary/40 transition-colors cursor-pointer" onClick={onPreview}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {t.is_system
              ? <Globe className="h-3 w-3 shrink-0 text-blue-600" />
              : <User className="h-3 w-3 shrink-0 text-emerald-600" />}
            <span className="text-xs font-semibold truncate">{t.name}</span>
          </div>
          <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{t.category}</span>
        </div>
        <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          <button onClick={onDuplicate} title="คัดลอก" className="rounded p-1 hover:bg-muted"><Copy className="h-3.5 w-3.5 text-muted-foreground" /></button>
          {canEdit && <button onClick={onEdit} title="แก้ไข" className="rounded p-1 hover:bg-muted"><Edit2 className="h-3.5 w-3.5 text-muted-foreground" /></button>}
          {canEdit && <button onClick={onDelete} title="ลบ" className="rounded p-1 hover:bg-muted hover:text-red-600"><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></button>}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{t.subject}</p>
    </div>
  );
}
