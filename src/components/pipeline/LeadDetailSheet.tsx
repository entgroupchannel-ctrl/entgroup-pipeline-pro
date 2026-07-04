import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { crmDb, ACTIVE_STAGES, OUTCOME_STAGES, STAGE_LABEL_TH, type Lead, type LeadStage } from "@/lib/crm";
import { formatBaht } from "@/lib/format";
import { LeadActivities } from "./LeadActivities";

interface Props {
  leadId: string | null;
  onClose: () => void;
  onChanged: () => void;
}

export function LeadDetailSheet({ leadId, onClose, onChanged }: Props) {
  const [lead, setLead] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    expected_value: "",
    expected_close_date: "",
    flowaccount_quotation_no: "",
    flowaccount_quotation_url: "",
    stage: "new" as LeadStage,
    lost_reason: "",
    source: "",
  });

  useEffect(() => {
    if (!leadId) {
      setLead(null);
      return;
    }
    setLoading(true);
    (async () => {
      const { data: leadData, error } = await crmDb()
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .maybeSingle();
      if (error) {
        toast.error("โหลดดีลไม่สำเร็จ", { description: error.message });
        setLoading(false);
        return;
      }
      if (!leadData) {
        setLoading(false);
        return;
      }
      const [accountRes, contactRes] = await Promise.all([
        leadData.account_id
          ? crmDb().from("accounts").select("id,name").eq("id", leadData.account_id).maybeSingle()
          : Promise.resolve({ data: null } as any),
        leadData.contact_id
          ? crmDb().from("contacts").select("id,name,phone,line_id").eq("id", leadData.contact_id).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);
      const data: any = { ...leadData, account: accountRes.data ?? null, contact: contactRes.data ?? null };
      setLead(data);
      setForm({
        title: data.title ?? "",
        expected_value: data.expected_value != null ? String(data.expected_value) : "",
        expected_close_date: data.expected_close_date ?? "",
        flowaccount_quotation_no: data.flowaccount_quotation_no ?? "",
        flowaccount_quotation_url: data.flowaccount_quotation_url ?? "",
        stage: (data.stage as LeadStage) ?? "new",
        lost_reason: data.lost_reason ?? "",
        source: data.source ?? "",
      });
      setLoading(false);
    })();
  }, [leadId]);

  const save = async () => {
    if (!lead) return;
    setSaving(true);
    const payload: any = {
      title: form.title,
      expected_value: form.expected_value ? Number(form.expected_value) : null,
      expected_close_date: form.expected_close_date || null,
      flowaccount_quotation_no: form.flowaccount_quotation_no || null,
      flowaccount_quotation_url: form.flowaccount_quotation_url || null,
      stage: form.stage,
      lost_reason: form.stage === "lost" ? form.lost_reason || null : null,
      source: form.source || null,
    };
    const { error } = await crmDb().from("leads").update(payload).eq("id", lead.id);
    setSaving(false);
    if (error) {
      toast.error("บันทึกไม่สำเร็จ", { description: error.message });
      return;
    }
    toast.success("บันทึกแล้ว");
    onChanged();
    onClose();
  };

  return (
    <Sheet open={!!leadId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle>รายละเอียดดีล</SheetTitle>
        </SheetHeader>

        {loading || !lead ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">บริษัท</div>
              <div className="text-sm font-semibold">{lead.account?.name ?? "-"}</div>
              {lead.contact && (
                <div className="mt-2 text-xs text-muted-foreground">
                  ผู้ติดต่อ: <span className="text-foreground">{lead.contact.name}</span>
                  {lead.contact.phone && <> · โทร {lead.contact.phone}</>}
                  {lead.contact.line_id && <> · Line {lead.contact.line_id}</>}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>ชื่อดีล</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>มูลค่าคาดหวัง (บาท)</Label>
                <Input
                  type="number"
                  value={form.expected_value}
                  onChange={(e) => setForm({ ...form, expected_value: e.target.value })}
                />
                <div className="text-xs text-muted-foreground">
                  {formatBaht(Number(form.expected_value || 0))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>วันปิดคาดหวัง</Label>
                <Input
                  type="date"
                  value={form.expected_close_date}
                  onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>สถานะ (Stage)</Label>
              <div className="flex flex-wrap gap-1.5">
                {[...ACTIVE_STAGES, ...OUTCOME_STAGES].map((s) => (
                  <button
                    key={s}
                    onClick={() => setForm({ ...form, stage: s })}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      form.stage === s ? `stage-badge-${s} border-transparent` : "bg-background hover:bg-muted"
                    }`}
                  >
                    {STAGE_LABEL_TH[s]}
                  </button>
                ))}
              </div>
            </div>

            {form.stage === "lost" && (
              <div className="space-y-2">
                <Label>เหตุผลที่แพ้ดีล</Label>
                <Textarea
                  value={form.lost_reason}
                  onChange={(e) => setForm({ ...form, lost_reason: e.target.value })}
                  rows={3}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>ที่มา (Source)</Label>
              <Select value={form.source || "none"} onValueChange={(v) => setForm({ ...form, source: v === "none" ? "" : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="เลือกที่มา" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">ไม่ระบุ</SelectItem>
                  <SelectItem value="line_oa">LINE OA</SelectItem>
                  <SelectItem value="website">เว็บไซต์</SelectItem>
                  <SelectItem value="referral">แนะนำ</SelectItem>
                  <SelectItem value="other">อื่นๆ</SelectItem>
                </SelectContent>
              </Select>
              {form.source && (
                <Badge variant="secondary" className="text-xs">
                  {form.source}
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              <Label>FlowAccount เลขที่ใบเสนอราคา</Label>
              <div className="flex gap-2">
                <Input
                  value={form.flowaccount_quotation_no}
                  onChange={(e) => setForm({ ...form, flowaccount_quotation_no: e.target.value })}
                  placeholder="เช่น QT-2025-001"
                />
                {form.flowaccount_quotation_url && (
                  <Button variant="outline" size="icon" asChild>
                    <a href={form.flowaccount_quotation_url} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>
              <Input
                value={form.flowaccount_quotation_url}
                onChange={(e) => setForm({ ...form, flowaccount_quotation_url: e.target.value })}
                placeholder="ลิงก์ (URL)"
              />
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" onClick={onClose}>
                ยกเลิก
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                บันทึก
              </Button>
            </div>

            <LeadActivities leadId={lead.id} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
