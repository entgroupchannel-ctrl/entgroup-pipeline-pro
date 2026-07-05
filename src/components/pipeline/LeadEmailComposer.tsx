import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sparkles, Send, Loader2, Mail, RotateCcw, ChevronDown, ChevronUp,
  CalendarClock, MessageCircleHeart, HandHeart, FileText, UserPlus, BellRing, Tag, Wand2,
} from "lucide-react";
import { draftLeadEmail, sendLeadEmail } from "@/lib/lead-email.functions";
import { useAuth } from "@/lib/auth-context";
import { STAGE_LABEL_TH, type LeadStage } from "@/lib/crm";


// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Context passed to AI */
  leadId?:      string;
  leadTitle?:   string;
  stage?:       LeadStage | string;
  contactId?:   string;
  contactName?: string;
  contactEmail?: string;
  companyName?: string;
  /** called after successful send so parent can refresh activities */
  onSent?: () => void;
}

// ── AI template suggestions ───────────────────────────────────────────────────

const QUICK_BRIEFS = [
  { label: "ติดตามหลังนำเสนอ",    text: "ติดตามผลหลังจากนำเสนอสินค้า/บริการ ถามว่ามีคำถามหรือต้องการข้อมูลเพิ่มเติมไหม" },
  { label: "ส่งใบเสนอราคา",       text: "แจ้งว่าได้ส่งใบเสนอราคาให้แล้ว ขอให้ตรวจสอบและแจ้งผล" },
  { label: "ติดตาม Follow Up",     text: "ติดตามสถานะการพิจารณา ถามว่ามีข้อสงสัยหรือต้องการนัดคุยเพิ่มเติมไหม" },
  { label: "ขอบคุณหลังประชุม",    text: "ขอบคุณสำหรับเวลาในการประชุม สรุปประเด็นสำคัญและ next step" },
  { label: "แจ้งโปรโมชัน",        text: "แจ้งโปรโมชันพิเศษที่น่าสนใจสำหรับลูกค้า ไม่กดดัน เปิดให้ถาม" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function LeadEmailComposer({
  open, onOpenChange,
  leadId, leadTitle, stage, contactId, contactName, contactEmail, companyName,
  onSent,
}: Props) {
  const { user, profile } = useAuth() as any;

  const doDraft = useServerFn(draftLeadEmail);
  const doSend  = useServerFn(sendLeadEmail);

  const [step, setStep]           = useState<"compose" | "preview">("compose");
  const [brief, setBrief]         = useState("");
  const [toEmail, setToEmail]     = useState(contactEmail ?? "");
  const [toName,  setToName]      = useState(contactName  ?? "");
  const [subject, setSubject]     = useState("");
  const [body,    setBody]        = useState("");
  const [drafting, setDrafting]   = useState(false);
  const [sending,  setSending]    = useState(false);
  const [showCtx,  setShowCtx]    = useState(false);

  const stageLabel = stage ? (STAGE_LABEL_TH[stage as LeadStage] ?? stage) : undefined;

  const reset = () => {
    setBrief(""); setSubject(""); setBody("");
    setToEmail(contactEmail ?? ""); setToName(contactName ?? "");
    setStep("compose"); setShowCtx(false);
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const handleDraft = async () => {
    if (!brief.trim()) { toast.error("กรุณาระบุสิ่งที่ต้องการสื่อก่อน"); return; }
    setDrafting(true);
    try {
      const result = await doDraft({
        data: {
          brief,
          lead_title:   leadTitle,
          contact_name: toName || contactName,
          company_name: companyName,
          stage:        stageLabel,
          sender_name:  profile?.full_name || user?.email,
        },
      }) as { subject: string; body: string };
      setSubject(result.subject);
      setBody(result.body);
      setStep("preview");
    } catch (e: any) {
      toast.error("AI ร่างอีเมลไม่สำเร็จ", { description: e?.message });
    } finally {
      setDrafting(false);
    }
  };

  const handleSend = async () => {
    if (!toEmail.trim()) { toast.error("กรุณาระบุอีเมลผู้รับ"); return; }
    if (!subject.trim()) { toast.error("กรุณาระบุหัวเรื่อง");    return; }
    if (!body.trim())    { toast.error("กรุณาระบุเนื้อหา");      return; }
    setSending(true);
    try {
      await doSend({
        data: {
          to:         toEmail.trim(),
          to_name:    toName.trim() || undefined,
          subject:    subject.trim(),
          body:       body.trim(),
          lead_id:    leadId,
          contact_id: contactId,
        },
      });
      toast.success("ส่งอีเมลแล้ว ✓", {
        description: `ถึง ${toName || toEmail}`,
      });
      onSent?.();
      handleOpenChange(false);
    } catch (e: any) {
      toast.error("ส่งอีเมลไม่สำเร็จ", { description: e?.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-muted-foreground" />
            ส่งอีเมลให้ลูกค้า
          </DialogTitle>
        </DialogHeader>

        {/* Context chip row */}
        <div className="flex flex-wrap items-center gap-1.5">
          {companyName && <Badge variant="secondary" className="text-xs">{companyName}</Badge>}
          {stageLabel   && <Badge variant="outline"    className="text-xs">{stageLabel}</Badge>}
          {contactName  && <Badge variant="outline"    className="text-xs">{contactName}</Badge>}
          {(companyName || stageLabel) && (
            <button
              className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowCtx((v) => !v)}
            >
              {showCtx ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showCtx ? "ซ่อน" : "แก้ไขผู้รับ"}
            </button>
          )}
        </div>

        {/* Recipient fields — shown when context expanded or no contact */}
        {(showCtx || !contactEmail) && (
          <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
            <div className="space-y-1">
              <Label className="text-xs">ชื่อผู้รับ</Label>
              <Input
                value={toName}
                onChange={(e) => setToName(e.target.value)}
                placeholder="คุณชื่อ..."
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">อีเมล *</Label>
              <Input
                type="email"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                placeholder="email@example.com"
                className="h-8 text-sm"
              />
            </div>
          </div>
        )}

        {/* ── Step: Compose (Brief) ── */}
        {step === "compose" && (
          <div className="space-y-4">
            {/* Quick briefs */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">เริ่มด้วย template</Label>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_BRIEFS.map((q) => (
                  <button
                    key={q.label}
                    onClick={() => setBrief(q.text)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      brief === q.text
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background hover:bg-muted"
                    }`}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Brief input */}
            <div className="space-y-1.5">
              <Label>สิ่งที่ต้องการสื่อ</Label>
              <Textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="เช่น ติดตามผลหลังส่งใบเสนอราคา อยากถามว่าตัดสินใจได้ยัง และเปิดรับนัดประชุมเพิ่ม"
                rows={4}
                className="resize-none text-sm"
              />
              <p className="text-xs text-muted-foreground">
                AI จะร่างอีเมลภาษาไทยให้ ปรับแก้ได้ก่อนส่ง
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                ยกเลิก
              </Button>
              <Button onClick={handleDraft} disabled={drafting || !brief.trim()}>
                {drafting
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />กำลังร่าง…</>
                  : <><Sparkles className="mr-2 h-4 w-4" />ให้ AI ร่างให้</>}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step: Preview & Edit ── */}
        {step === "preview" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>หัวเรื่อง</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>เนื้อหา</Label>
                <button
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setStep("compose")}
                >
                  <RotateCcw className="h-3 w-3" />
                  ร่างใหม่
                </button>
              </div>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                className="resize-y text-sm"
              />
            </div>

            {/* Preview email metadata */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
              <div className="flex gap-2 text-xs">
                <span className="w-10 shrink-0 text-muted-foreground">ถึง</span>
                <span className="font-medium">
                  {toName ? `${toName} <${toEmail}>` : toEmail || "—"}
                </span>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="w-10 shrink-0 text-muted-foreground">เรื่อง</span>
                <span>{subject || "—"}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setStep("compose")}>
                แก้ brief
              </Button>
              <Button
                onClick={handleSend}
                disabled={sending || !toEmail || !subject || !body}
              >
                {sending
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />กำลังส่ง…</>
                  : <><Send className="mr-2 h-4 w-4" />ส่งอีเมล</>}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
