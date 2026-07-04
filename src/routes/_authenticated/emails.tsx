import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mail, Sparkles, Send, Loader2, RotateCcw, Search, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";
import { draftLeadEmail, sendLeadEmail } from "@/lib/lead-email.functions";

const TEMPLATES_KEY = "email_templates";
type SavedTemplate = { id: string; name: string; subject: string; body: string; created_at: string };

function loadTemplates(): SavedTemplate[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(TEMPLATES_KEY) || "[]"); }
  catch { return []; }
}
function saveTemplates(list: SavedTemplate[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TEMPLATES_KEY, JSON.stringify(list));
}

export const Route = createFileRoute("/_authenticated/emails")({
  component: EmailsPage,
});

const QUICK_BRIEFS = [
  { label: "ติดตามหลังนำเสนอ",    text: "ติดตามผลหลังจากนำเสนอสินค้า/บริการ ถามว่ามีคำถามหรือต้องการข้อมูลเพิ่มเติมไหม" },
  { label: "ส่งใบเสนอราคา",       text: "แจ้งว่าได้ส่งใบเสนอราคาให้แล้ว ขอให้ตรวจสอบและแจ้งผล" },
  { label: "ติดตาม Follow Up",     text: "ติดตามสถานะการพิจารณา ถามว่ามีข้อสงสัยหรือต้องการนัดคุยเพิ่มเติมไหม" },
  { label: "ขอบคุณหลังประชุม",    text: "ขอบคุณสำหรับเวลาในการประชุม สรุปประเด็นสำคัญและ next step" },
  { label: "แจ้งโปรโมชัน",        text: "แจ้งโปรโมชันพิเศษที่น่าสนใจสำหรับลูกค้า ไม่กดดัน เปิดให้ถาม" },
];

function EmailsPage() {
  const { user, profile } = useAuth() as any;

  const doDraft = useServerFn(draftLeadEmail);
  const doSend  = useServerFn(sendLeadEmail);

  // contact lookup
  const [contactQuery, setContactQuery] = useState("");
  const [contacts, setContacts]         = useState<any[]>([]);
  const [selected, setSelected]         = useState<any>(null);
  const [searching, setSearching]       = useState(false);

  // compose
  const [brief,   setBrief]   = useState("");
  const [to,      setTo]      = useState("");
  const [toName,  setToName]  = useState("");
  const [subject, setSubject] = useState("");
  const [body,    setBody]    = useState("");
  const [step,    setStep]    = useState<"compose" | "preview">("compose");
  const [drafting, setDrafting] = useState(false);
  const [sending,  setSending]  = useState(false);

  // history
  const [logs, setLogs] = useState<any[]>([]);

  const searchContacts = async (q: string) => {
    if (!q.trim()) { setContacts([]); return; }
    setSearching(true);
    const { data } = await crmDb()
      .from("contacts")
      .select("id, company_name, contact_name, email")
      .or(`company_name.ilike.%${q}%,contact_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(8);
    setContacts(data ?? []);
    setSearching(false);
  };

  useEffect(() => {
    const t = setTimeout(() => searchContacts(contactQuery), 300);
    return () => clearTimeout(t);
  }, [contactQuery]);

  const pickContact = (c: any) => {
    setSelected(c);
    setTo(c.email ?? "");
    setToName(c.contact_name ?? c.company_name ?? "");
    setContacts([]);
    setContactQuery("");
  };

  const loadLogs = async () => {
    const { data } = await crmDb()
      .from("email_send_log")
      .select("*")
      .eq("template_name", "lead_email_manual")
      .order("created_at", { ascending: false })
      .limit(20);
    setLogs(data ?? []);
  };

  useEffect(() => { loadLogs(); }, []);

  const handleDraft = async () => {
    if (!brief.trim()) { toast.error("กรุณาระบุสิ่งที่ต้องการสื่อ"); return; }
    setDrafting(true);
    try {
      const result = await doDraft({
        data: {
          brief,
          contact_name: toName,
          company_name: selected?.company_name,
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
    if (!to.trim())      { toast.error("กรุณาระบุอีเมลผู้รับ"); return; }
    if (!subject.trim()) { toast.error("กรุณาระบุหัวเรื่อง");    return; }
    if (!body.trim())    { toast.error("กรุณาระบุเนื้อหา");      return; }
    setSending(true);
    try {
      await doSend({
        data: {
          to:         to.trim(),
          to_name:    toName.trim() || undefined,
          subject:    subject.trim(),
          body:       body.trim(),
          contact_id: selected?.id,
        },
      });
      toast.success("ส่งอีเมลแล้ว ✓", { description: `ถึง ${toName || to}` });
      // reset
      setBrief(""); setSubject(""); setBody(""); setTo(""); setToName("");
      setSelected(null); setStep("compose");
      loadLogs();
    } catch (e: any) {
      toast.error("ส่งอีเมลไม่สำเร็จ", { description: e?.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">ส่งอีเมล</h1>
            <p className="text-xs text-muted-foreground">ร่างด้วย AI แล้วส่งหาลูกค้าได้เลย</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Compose panel ── */}
        <div className="lg:col-span-2 space-y-5">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h2 className="text-sm font-semibold">ร่างอีเมลใหม่</h2>

            {/* Contact search */}
            <div className="space-y-1.5">
              <Label className="text-xs">ผู้รับ</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8 text-sm"
                  placeholder="ค้นหาชื่อบริษัทหรืออีเมล…"
                  value={contactQuery}
                  onChange={(e) => setContactQuery(e.target.value)}
                />
                {searching && (
                  <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              {contacts.length > 0 && (
                <div className="rounded-lg border bg-popover shadow-md divide-y">
                  {contacts.map((c) => (
                    <button
                      key={c.id}
                      className="flex w-full flex-col px-3 py-2 text-left hover:bg-muted"
                      onClick={() => pickContact(c)}
                    >
                      <span className="text-sm font-medium">{c.company_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {c.contact_name} · {c.email || "ไม่มีอีเมล"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {selected && (
                <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{selected.company_name}</div>
                    <div className="text-xs text-muted-foreground truncate">{to}</div>
                  </div>
                  <button
                    className="text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => { setSelected(null); setTo(""); setToName(""); }}
                  >
                    ลบ
                  </button>
                </div>
              )}
            </div>

            {/* Manual email override */}
            {!selected && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">ชื่อผู้รับ</Label>
                  <Input value={toName} onChange={(e) => setToName(e.target.value)} placeholder="คุณชื่อ..." className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">อีเมล *</Label>
                  <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="email@example.com" className="h-8 text-sm" />
                </div>
              </div>
            )}

            {/* Step compose */}
            {step === "compose" && (
              <>
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

                <div className="space-y-1.5">
                  <Label>สิ่งที่ต้องการสื่อ</Label>
                  <Textarea
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    placeholder="เช่น อยากติดตามผลหลังส่งใบเสนอราคาไปเมื่อวาน ถามว่าตัดสินใจได้ยัง และเสนอนัดประชุมเพิ่มเติม"
                    rows={4}
                    className="resize-none text-sm"
                  />
                </div>

                <Button onClick={handleDraft} disabled={drafting || !brief.trim()} className="w-full">
                  {drafting
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />กำลังร่าง…</>
                    : <><Sparkles className="mr-2 h-4 w-4" />ให้ AI ร่างให้</>}
                </Button>
              </>
            )}

            {/* Step preview */}
            {step === "preview" && (
              <>
                <div className="space-y-1.5">
                  <Label>หัวเรื่อง</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>เนื้อหา</Label>
                    <button
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setStep("compose")}
                    >
                      <RotateCcw className="h-3 w-3" /> ร่างใหม่
                    </button>
                  </div>
                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={12}
                    className="resize-y text-sm"
                  />
                </div>

                {/* Send summary */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                  <div className="flex gap-2 text-xs">
                    <span className="w-10 shrink-0 text-muted-foreground">ถึง</span>
                    <span className="font-medium">{toName ? `${toName} <${to}>` : to || "—"}</span>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="w-10 shrink-0 text-muted-foreground">เรื่อง</span>
                    <span>{subject || "—"}</span>
                  </div>
                </div>

                <Button onClick={handleSend} disabled={sending || !to || !subject || !body} className="w-full">
                  {sending
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />กำลังส่ง…</>
                    : <><Send className="mr-2 h-4 w-4" />ส่งอีเมล</>}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ── History panel ── */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">ส่งล่าสุด</h2>
          {logs.length === 0 ? (
            <p className="text-xs text-muted-foreground">ยังไม่มีประวัติการส่ง</p>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className="rounded-lg border bg-card p-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-medium line-clamp-1">{log.subject || "—"}</span>
                    <Badge
                      variant={log.status === "sent" ? "default" : "destructive"}
                      className="shrink-0 text-[10px]"
                    >
                      {log.status === "sent" ? "ส่งแล้ว" : "ล้มเหลว"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{log.recipient_email}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(log.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                  </div>
                  {log.error_message && (
                    <div className="text-xs text-destructive">{log.error_message}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
