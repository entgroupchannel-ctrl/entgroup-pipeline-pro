import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Mail, Sparkles, Send, Loader2, RotateCcw, Search, Save, Trash2,
  AlertTriangle, CheckCircle2, Settings,
} from "lucide-react";
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
import { loadAISettings, type AISettings } from "@/lib/ai-settings.functions";

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

// ── AI Status Banner ──────────────────────────────────────────────────────────

function AIStatusBanner({ aiCfg, role }: { aiCfg: AISettings | null; role: string }) {
  if (!aiCfg) return null;

  // ready
  if (aiCfg.isActive && aiCfg.emailDraftEnabled && aiCfg.keyStatus === "ok") return null;

  const isAdmin = role === "admin";

  // determine problem
  const problem =
    !aiCfg.hasKey         ? "ยังไม่มี Claude API Key" :
    aiCfg.keyStatus === "invalid" ? "Claude API Key ไม่ถูกต้อง" :
    !aiCfg.isActive       ? "Claude AI ยังปิดอยู่" :
    !aiCfg.emailDraftEnabled ? "ฟีเจอร์ร่างอีเมลถูกปิด" :
    "ไม่สามารถเชื่อมต่อ AI ได้";

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
          AI ร่างอีเมลไม่พร้อมใช้งาน — {problem}
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
          {isAdmin
            ? "ไปที่ ตั้งค่า > AI ✦ เพื่อกำหนดค่า"
            : "ติดต่อ Admin เพื่อเปิดใช้งาน"}
        </p>
      </div>
      {isAdmin && (
        <Link to="/settings">
          <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs gap-1">
            <Settings className="h-3.5 w-3.5" /> ตั้งค่า AI
          </Button>
        </Link>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

function EmailsPage() {
  const { user, profile, role } = useAuth() as any;

  const doDraft     = useServerFn(draftLeadEmail);
  const doSend      = useServerFn(sendLeadEmail);
  const doLoadAI    = useServerFn(loadAISettings);

  // AI config state
  const [aiCfg, setAiCfg] = useState<AISettings | null>(null);
  const aiReady = aiCfg?.isActive && aiCfg?.emailDraftEnabled && aiCfg?.keyStatus === "ok";

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

  // templates
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  useEffect(() => { setTemplates(loadTemplates()); }, []);

  // Load AI config once on mount
  useEffect(() => {
    doLoadAI().then((cfg) => setAiCfg(cfg as AISettings)).catch(() => {});
  }, []);

  const applyTemplate = (t: SavedTemplate) => {
    setSubject(t.subject);
    setBody(t.body);
    setStep("preview");
    toast.success(`โหลด template: ${t.name}`);
  };
  const deleteTemplate = (id: string) => {
    const next = templates.filter((t) => t.id !== id);
    setTemplates(next); saveTemplates(next);
    toast.success("ลบ template แล้ว");
  };
  const confirmSaveTemplate = () => {
    const name = tplName.trim();
    if (!name) { toast.error("กรุณาระบุชื่อ template"); return; }
    if (!subject.trim() || !body.trim()) { toast.error("ยังไม่มีเนื้อหาให้บันทึก"); return; }
    const next: SavedTemplate[] = [
      ...templates,
      { id: crypto.randomUUID(), name, subject: subject.trim(), body: body.trim(), created_at: new Date().toISOString() },
    ];
    setTemplates(next); saveTemplates(next);
    setSaveOpen(false); setTplName("");
    toast.success("บันทึก template แล้ว ✓");
  };

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
      // Server returns descriptive Thai messages — show them directly
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
    <div className="mx-auto max-w-5xl space-y-4 p-6">
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

        {/* AI status pill */}
        {aiCfg && (
          <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs border ${
            aiReady
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-400"
              : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-400"
          }`}>
            {aiReady
              ? <CheckCircle2 className="h-3.5 w-3.5" />
              : <AlertTriangle className="h-3.5 w-3.5" />}
            {aiReady
              ? `AI พร้อม · ${aiCfg.model.replace("claude-", "").replace("-4-6", " 4.6").replace("-4-5-20251001", " 4.5")}`
              : "AI ยังไม่พร้อม"}
          </div>
        )}
      </div>

      {/* AI config warning banner */}
      <AIStatusBanner aiCfg={aiCfg} role={role ?? "sales"} />

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

                <Button
                  onClick={handleDraft}
                  disabled={drafting || !brief.trim() || !aiReady}
                  className="w-full"
                  title={!aiReady ? "AI ยังไม่พร้อม — ตั้งค่าก่อน" : undefined}
                >
                  {drafting
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />กำลังร่าง…</>
                    : <><Sparkles className="mr-2 h-4 w-4" />ให้ AI ร่างให้</>}
                </Button>

                {/* Inline hint if AI not ready */}
                {!aiReady && aiCfg !== null && (
                  <p className="text-center text-xs text-muted-foreground">
                    {role === "admin"
                      ? <>AI ยังไม่พร้อม — <Link to="/settings" className="text-primary hover:underline">ตั้งค่า AI ✦</Link></>
                      : "AI ยังไม่พร้อม — ติดต่อ Admin"}
                  </p>
                )}
              </>
            )}

            {/* Step preview */}
            {step === "preview" && (
              <>
                {/* Template picker */}
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Template ที่บันทึกไว้</Label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-xs">
                        📋 เลือก Template
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72">
                      <DropdownMenuLabel className="text-xs">Templates ({templates.length})</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {templates.length === 0 ? (
                        <div className="px-2 py-3 text-xs text-muted-foreground">ยังไม่มี template ที่บันทึก</div>
                      ) : (
                        templates.map((t) => (
                          <DropdownMenuItem
                            key={t.id}
                            onSelect={(e) => e.preventDefault()}
                            className="flex items-center justify-between gap-2"
                          >
                            <button
                              className="flex-1 text-left min-w-0"
                              onClick={() => applyTemplate(t)}
                            >
                              <div className="text-sm truncate">{t.name}</div>
                              <div className="text-[10px] text-muted-foreground truncate">{t.subject}</div>
                            </button>
                            <button
                              className="text-muted-foreground hover:text-destructive shrink-0"
                              onClick={() => deleteTemplate(t.id)}
                              aria-label="ลบ template"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuItem>
                        ))
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="space-y-1.5">
                  <Label>หัวเรื่อง</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>เนื้อหา</Label>
                    <div className="flex items-center gap-3">
                      <button
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setSaveOpen(true)}
                        disabled={!subject.trim() || !body.trim()}
                      >
                        <Save className="h-3 w-3" /> 💾 บันทึกเป็น Template
                      </button>
                      <button
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setStep("compose")}
                      >
                        <RotateCcw className="h-3 w-3" /> ร่างใหม่
                      </button>
                    </div>
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

        {/* ── History + AI info panel ── */}
        <div className="space-y-4">
          {/* AI config card */}
          {aiCfg && aiReady && (
            <div className="rounded-xl border bg-card p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> AI พร้อมใช้งาน
              </div>
              <div className="text-[11px] text-muted-foreground space-y-0.5">
                <div>โมเดล: <span className="font-medium">{aiCfg.model}</span></div>
                <div>ความยาว: <span className="font-medium">สูงสุด {aiCfg.maxTokens.toLocaleString()} tokens</span></div>
              </div>
            </div>
          )}

          {/* History */}
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

      {/* Save template dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>บันทึกเป็น Template</DialogTitle>
            <DialogDescription>ตั้งชื่อ template เพื่อเรียกใช้ในภายหลัง</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">ชื่อ Template</Label>
            <Input
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              placeholder="เช่น ติดตามหลังนำเสนอ"
              onKeyDown={(e) => { if (e.key === "Enter") confirmSaveTemplate(); }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>ยกเลิก</Button>
            <Button onClick={confirmSaveTemplate}>บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
