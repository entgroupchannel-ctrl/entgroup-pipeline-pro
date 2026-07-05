import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Mail, Sparkles, Send, Loader2, RotateCcw, Search, Save, Trash2,
  AlertTriangle, CheckCircle2, Settings, Paperclip, X as XIcon,
  Users, Briefcase, ChevronDown, Plus,
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { draftLeadEmail, sendLeadEmail } from "@/lib/lead-email.functions";
import { loadAISettings, type AISettings } from "@/lib/ai-settings.functions";

type SavedTemplate = { id: string; name: string; category: string; subject: string; body: string; is_system: boolean; created_at: string };
type RecipientMode = "contact" | "lead";

// Merge tags substitution
function applyMergeTags(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, key) => vars[key.trim()] ?? `{{${key.trim()}}}`);
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

const STAGE_LABEL: Record<string, string> = {
  new: "ลูกค้าใหม่", qualified: "ผ่านการคัดกรอง", proposal: "เสนอราคา",
  negotiation: "เจรจา", closing: "ปิดดีล", won: "ชนะ", lost: "แพ้",
};

// ── AI Status Banner ──────────────────────────────────────────────────────────

function AIStatusBanner({ aiCfg, role }: { aiCfg: AISettings | null; role: string }) {
  if (!aiCfg) return null;
  if (aiCfg.isActive && aiCfg.emailDraftEnabled && aiCfg.keyStatus === "ok") return null;
  const isAdmin = role === "admin";
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
          {isAdmin ? "ไปที่ ตั้งค่า > AI ✦ เพื่อกำหนดค่า" : "ติดต่อ Admin เพื่อเปิดใช้งาน"}
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

// ── Recipient Selector ────────────────────────────────────────────────────────

interface RecipientSelectorProps {
  mode: RecipientMode;
  onModeChange: (m: RecipientMode) => void;
  selected: any;
  onSelect: (item: any, mode: RecipientMode) => void;
  onClear: () => void;
  to: string;
  onToChange: (v: string) => void;
  toName: string;
  onToNameChange: (v: string) => void;
}

function RecipientSelector({
  mode, onModeChange, selected, onSelect, onClear,
  to, onToChange, toName, onToNameChange,
}: RecipientSelectorProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const search = async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    if (mode === "contact") {
      const { data, error: contactErr } = await crmDb()
        .from("contacts")
        .select("id, name, email, position, account_id")
        .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(8);
      if (contactErr) { console.error("[email search] contacts error:", contactErr); setSearching(false); return; }
      console.log("[email search] contacts found:", data?.length, "for query:", q);
      // Fetch account names for matched contacts
      const accountIds = [...new Set((data ?? []).map((c: any) => c.account_id).filter(Boolean))];
      let accountMap: Record<string, string> = {};
      if (accountIds.length) {
        const { data: accs } = await crmDb().from("accounts").select("id,name").in("id", accountIds);
        accountMap = Object.fromEntries((accs ?? []).map((a: any) => [a.id, a.name]));
      }
      setResults((data ?? []).map((c: any) => ({ ...c, company_name: accountMap[c.account_id] ?? "" })));
    } else {
      // Lead mode: search leads by title or account name
      const { data: leadsData } = await crmDb()
        .from("leads")
        .select("id, title, stage, expected_value, contact_id, account_id")
        .ilike("title", `%${q}%`)
        .not("stage", "in", "(won,lost)")
        .order("updated_at", { ascending: false })
        .limit(8);
      // Enrich with account + contact
      const accountIds = [...new Set((leadsData ?? []).map((l: any) => l.account_id).filter(Boolean))];
      const contactIds = [...new Set((leadsData ?? []).map((l: any) => l.contact_id).filter(Boolean))];
      let accountMap: Record<string, any> = {};
      let contactMap: Record<string, any> = {};
      if (accountIds.length) {
        const { data: accs } = await crmDb().from("accounts").select("id,name").in("id", accountIds);
        accountMap = Object.fromEntries((accs ?? []).map((a: any) => [a.id, a]));
      }
      if (contactIds.length) {
        const { data: cts } = await crmDb().from("contacts").select("id,name,email").in("id", contactIds);
        contactMap = Object.fromEntries((cts ?? []).map((c: any) => [c.id, c]));
      }
      setResults((leadsData ?? []).map((l: any) => ({
        ...l,
        account: l.account_id ? accountMap[l.account_id] : null,
        contact: l.contact_id ? contactMap[l.contact_id] : null,
      })));
    }
    setSearching(false);
  };

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => search(query), 450);
    return () => clearTimeout(t);
  }, [query, mode]);

  const handleSelect = (item: any) => {
    onSelect(item, mode);
    setQuery("");
    setResults([]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Label className="text-sm font-semibold shrink-0">ผู้รับอีเมล</Label>
        {/* Mode toggle — segmented control matching ปฏิทิน/รายการ style */}
        <div className="inline-flex items-center rounded-xl border border-border bg-muted/40 p-1 shadow-sm">
          <button
            onClick={() => { onModeChange("contact"); onClear(); setQuery(""); setResults([]); }}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              mode === "contact"
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground hover:bg-background/60"
            }`}
          >
            <Users className="h-4 w-4" /> รายชื่อผู้ติดต่อ
          </button>
          <button
            onClick={() => { onModeChange("lead"); onClear(); setQuery(""); setResults([]); }}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              mode === "lead"
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground hover:bg-background/60"
            }`}
          >
            <Briefcase className="h-4 w-4" /> ดีล / Lead
          </button>
        </div>
      </div>

      {/* Selected chip */}
      {selected ? (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
          <div className="flex-1 min-w-0">
            {mode === "lead" ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-primary">{selected.deal_number ?? selected.title}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0">{STAGE_LABEL[selected.stage] ?? selected.stage}</Badge>
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {selected.account?.name ?? "—"} · {selected.contact?.name ?? "—"} · {to || "ไม่มีอีเมล"}
                </div>
              </>
            ) : (
              <>
                <div className="text-sm font-medium truncate">{selected.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {selected.company_name ? `${selected.company_name} · ` : ""}{to || "ไม่มีอีเมล"}
                </div>
              </>
            )}
          </div>
          <button className="text-xs text-muted-foreground hover:text-destructive shrink-0" onClick={onClear}>
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 text-sm"
              placeholder={mode === "contact" ? "พิมพ์ชื่อหรืออีเมล (อย่างน้อย 2 ตัว)…" : "พิมพ์ชื่อบริษัท หรือเลขดีล (อย่างน้อย 2 ตัว)…"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {searching && <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          {results.length > 0 && (
            <div className="rounded-lg border bg-popover shadow-md divide-y max-h-52 overflow-y-auto">
              {results.map((item) => (
                <button
                  key={item.id}
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted transition-colors"
                  onClick={() => handleSelect(item)}
                >
                  {mode === "lead" ? (
                    <>
                      <Briefcase className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/50" />
                      <div className="flex-1 min-w-0">
                        {/* Row 1: deal_number + stage badge */}
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-primary">{item.deal_number ?? item.title}</span>
                          <Badge variant="outline" className="text-[10px] shrink-0">{STAGE_LABEL[item.stage] ?? item.stage}</Badge>
                        </div>
                        {/* Row 2: company */}
                        <div className="text-sm font-medium truncate">{item.account?.name ?? "—"}</div>
                        {/* Row 3: contact + email */}
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span>{item.contact?.name ?? "ไม่มีผู้ติดต่อ"}</span>
                          {item.contact?.email ? (
                            <span className="text-primary/70">· {item.contact.email}</span>
                          ) : (
                            <span className="text-amber-600">· ไม่มีอีเมล</span>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{item.name}</div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {item.company_name && <span>{item.company_name} ·</span>}
                          {item.email ? (
                            <span className="text-primary/70">{item.email}</span>
                          ) : (
                            <span className="text-amber-600">ไม่มีอีเมล</span>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Manual input fallback */}
          {!query && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">ชื่อผู้รับ (ระบุเอง)</Label>
                <Input value={toName} onChange={(e) => onToNameChange(e.target.value)} placeholder="คุณชื่อ..." className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">อีเมล *</Label>
                <Input type="email" value={to} onChange={(e) => onToChange(e.target.value)} placeholder="email@example.com" className="h-8 text-sm" />
              </div>
            </div>
          )}
        </>
      )}

      {/* If selected but no email, show email input */}
      {selected && !to && (
        <div className="space-y-1">
          <Label className="text-xs text-amber-600">⚠ ไม่พบอีเมลในระบบ — กรอกอีเมลด้วยตนเอง</Label>
          <Input type="email" value={to} onChange={(e) => onToChange(e.target.value)} placeholder="email@example.com" className="h-8 text-sm border-amber-300" />
        </div>
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

  // recipient
  const [recipientMode, setRecipientMode] = useState<RecipientMode>("contact");
  const [selected, setSelected]           = useState<any>(null);
  const [to,      setTo]                  = useState("");
  const [toName,  setToName]              = useState("");
  const [leadId,  setLeadId]              = useState<string | undefined>(undefined);

  // compose
  const [brief,   setBrief]   = useState("");
  const [subject, setSubject] = useState("");
  const [body,    setBody]    = useState("");
  const [step,    setStep]    = useState<"compose" | "preview">("compose");
  const [drafting, setDrafting] = useState(false);
  const [sending,  setSending]  = useState(false);

  // history
  const [logs, setLogs] = useState<any[]>([]);

  // templates
  const [templates, setTemplates]         = useState<SavedTemplate[]>([]);
  const [saveOpen, setSaveOpen]           = useState(false);
  const [tplName, setTplName]             = useState("");
  const [tplSearch, setTplSearch]         = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<{id:string;filename:string;mime_type:string;public_url:string;size:number}[]>([]);
  const [cc,  setCc]  = useState("");
  const [bcc, setBcc] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<{id:string;name:string;filename:string;size:number;mime_type:string;public_url:string}[]>([]);
  const [showAttachPicker, setShowAttachPicker] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadMediaFiles = async () => {
    const { data } = await crmDb().from("email_attachments").select("id,name,filename,size,mime_type,public_url").order("created_at", { ascending: false });
    setMediaFiles((data ?? []) as any[]);
  };
  useEffect(() => { loadMediaFiles(); }, []);

  const loadTemplates = async () => {
    const { data } = await crmDb().from("email_templates").select("*").eq("is_active", true).order("is_system", { ascending: false }).order("category").order("name");
    setTemplates((data ?? []) as SavedTemplate[]);
  };
  useEffect(() => { loadTemplates(); }, []);

  useEffect(() => {
    doLoadAI().then((cfg) => setAiCfg(cfg as AISettings)).catch(() => {});
  }, []);

  const applyTemplate = async (t: SavedTemplate) => {
    const vars: Record<string, string> = {
      "ชื่อผู้รับ":  toName || "คุณลูกค้า",
      "ชื่อบริษัท": selected?.company_name || selected?.account?.name || "",
      "ชื่อผู้ส่ง":  profile?.full_name || user?.email || "",
      "ชื่อดีล":    (selected?.deal_number ?? selected?.title) || "",
      "มูลค่าดีล":  selected?.expected_value ? `฿${Number(selected.expected_value).toLocaleString()}` : "",
      "วันที่วันนี้": new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" }),
    };
    setSubject(applyMergeTags(t.subject, vars));
    setBody(applyMergeTags(t.body, vars));
    const attachIds = (t as any).attachments ?? [];
    if (attachIds.length > 0) {
      const { data } = await crmDb().from("email_attachments").select("id,filename,mime_type,public_url,size").in("id", attachIds);
      setPendingAttachments((data ?? []) as any[]);
    } else {
      setPendingAttachments([]);
    }
    toast.success(`โหลด template: ${t.name}`);
  };

  const deleteTemplate = async (id: string) => {
    const { error } = await crmDb().from("email_templates").delete().eq("id", id);
    if (error) { toast.error("ลบไม่สำเร็จ"); return; }
    await loadTemplates();
    toast.success("ลบ template แล้ว");
  };

  const confirmSaveTemplate = async () => {
    const name = tplName.trim();
    if (!name) { toast.error("กรุณาระบุชื่อ template"); return; }
    if (!subject.trim() || !body.trim()) { toast.error("ยังไม่มีเนื้อหาให้บันทึก"); return; }
    const { error } = await crmDb().from("email_templates").insert({
      name, category: "ทั่วไป",
      subject: subject.trim(), body: body.trim(),
      is_system: false, created_by: user?.id,
    });
    if (error) { toast.error("บันทึกไม่สำเร็จ"); return; }
    await loadTemplates();
    setSaveOpen(false); setTplName("");
    toast.success("บันทึก template แล้ว ✓");
  };

  // Handle recipient selection from RecipientSelector
  const handleRecipientSelect = (item: any, mode: RecipientMode) => {
    setSelected(item);
    if (mode === "contact") {
      setTo(item.email ?? "");
      setToName(item.name ?? "");
      setLeadId(undefined);
    } else {
      // Lead mode: use contact email if available
      setTo(item.contact?.email ?? "");
      setToName(item.contact?.name ?? item.account?.name ?? item.title ?? "");
      setLeadId(item.id);
    }
  };

  const handleRecipientClear = () => {
    setSelected(null);
    setTo("");
    setToName("");
    setLeadId(undefined);
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
          lead_title:   selected?.deal_number ?? selected?.title,
          contact_name: toName,
          company_name: selected?.account?.name || selected?.company_name,
          stage:        selected?.stage ? (STAGE_LABEL[selected.stage] ?? selected.stage) : undefined,
          sender_name:  profile?.full_name || user?.email,
        },
      }) as { subject: string; body: string };
      setSubject(result.subject);
      setBody(result.body);
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
      const attachments: { filename: string; content: string; type: string }[] = [];
      for (const att of pendingAttachments) {
        try {
          const resp = await fetch(att.public_url);
          const blob = await resp.blob();
          const b64 = await new Promise<string>((res) => {
            const reader = new FileReader();
            reader.onload = () => res((reader.result as string).split(",")[1]);
            reader.readAsDataURL(blob);
          });
          attachments.push({ filename: att.filename, content: b64, type: att.mime_type });
        } catch { /* skip */ }
      }
      await doSend({
        data: {
          to:          to.trim(),
          to_name:     toName.trim() || undefined,
          subject:     subject.trim(),
          body:        body.trim(),
          lead_id:     leadId,
          contact_id:  recipientMode === "contact" ? selected?.id : selected?.contact_id,
          attachments: attachments.length > 0 ? attachments : undefined,
          cc:          cc.trim() || undefined,
          bcc:         bcc.trim() || undefined,
        },
      });
      toast.success("ส่งอีเมลแล้ว ✓", {
        description: `ถึง ${toName || to}${leadId ? ` · ดีล: ${selected?.deal_number ?? selected?.title}` : ""}${attachments.length > 0 ? ` · ไฟล์แนบ ${attachments.length} ไฟล์` : ""}`,
      });
      setBrief(""); setSubject(""); setBody(""); setTo(""); setToName(""); setCc(""); setBcc("");
      setSelected(null); setStep("compose"); setPendingAttachments([]); setLeadId(undefined); setShowCcBcc(false); setShowAiPanel(false);
      loadLogs();
    } catch (e: any) {
      toast.error("ส่งอีเมลไม่สำเร็จ", { description: e?.message });
    } finally {
      setSending(false);
    }
  };

  // Template grouping
  const CATS = ["แนะนำองค์กร","ใบเสนอราคา","Follow Up","สินค้าและบริการ","โปรโมชัน","ทั่วไป"];
  const personalTpls = templates.filter((t) => !t.is_system);
  const tplFiltered  = templates.filter((t) =>
    !tplSearch.trim() ||
    t.name.toLowerCase().includes(tplSearch.toLowerCase()) ||
    t.category.toLowerCase().includes(tplSearch.toLowerCase())
  );

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── LEFT: Template panel ── */}
      <div className="w-64 shrink-0 border-r bg-muted/10 flex flex-col overflow-hidden">
        <div className="border-b px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Email Templates</h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="ค้นหา template..."
              value={tplSearch}
              onChange={(e) => setTplSearch(e.target.value)}
              className="pl-8 h-7 text-xs"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {tplFiltered.length === 0 ? (
            <p className="px-4 py-6 text-xs text-muted-foreground text-center">ไม่พบ template</p>
          ) : (
            <>
              {CATS.map((cat) => {
                const catTpls = tplFiltered.filter((t) => t.is_system && t.category === cat);
                if (!catTpls.length) return null;
                return (
                  <div key={cat} className="mb-3">
                    <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{cat}</p>
                    {catTpls.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => applyTemplate(t)}
                        className="flex w-full items-start gap-2 px-4 py-2.5 text-left hover:bg-primary/5 hover:text-primary transition-colors group"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate group-hover:text-primary">{t.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate mt-0.5">{t.subject}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })}
              {personalTpls.filter((t) => !tplSearch.trim() || t.name.toLowerCase().includes(tplSearch.toLowerCase())).length > 0 && (
                <div className="mb-3 border-t pt-2">
                  <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">ส่วนตัว</p>
                  {personalTpls
                    .filter((t) => !tplSearch.trim() || t.name.toLowerCase().includes(tplSearch.toLowerCase()))
                    .map((t) => (
                      <button
                        key={t.id}
                        onClick={() => applyTemplate(t)}
                        className="flex w-full items-start gap-2 px-4 py-2.5 text-left hover:bg-primary/5 hover:text-primary transition-colors group"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate group-hover:text-primary">{t.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate mt-0.5">{t.subject}</p>
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── CENTER + RIGHT ── */}
      <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-4xl space-y-4 p-6">

      <AIStatusBanner aiCfg={aiCfg} role={role ?? "sales"} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Compose panel ── */}
        <div className="lg:col-span-2 space-y-5">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">ร่างอีเมลใหม่</h2>
              {aiCfg && (
                <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] border ${
                  aiReady
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400"
                    : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-400"
                }`}>
                  {aiReady ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                  {aiReady ? "AI พร้อม" : "AI ยังไม่พร้อม"}
                </div>
              )}
            </div>

            {/* Recipient selector */}
            <RecipientSelector
              mode={recipientMode}
              onModeChange={setRecipientMode}
              selected={selected}
              onSelect={handleRecipientSelect}
              onClear={handleRecipientClear}
              to={to}
              onToChange={setTo}
              toName={toName}
              onToNameChange={setToName}
            />

            {/* Lead context badge when lead selected */}
            {leadId && selected && (
              <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                <Briefcase className="h-3.5 w-3.5 shrink-0 text-primary" />
                <div className="flex-1 min-w-0 text-xs">
                  <span className="font-medium text-primary">{selected.deal_number ?? selected.title}</span>
                  <span className="text-muted-foreground"> · {STAGE_LABEL[selected.stage] ?? selected.stage}</span>
                  {selected.expected_value && (
                    <span className="text-muted-foreground"> · ฿{Number(selected.expected_value).toLocaleString()}</span>
                  )}
                </div>
                <span className="text-[10px] text-primary/60 shrink-0">activity จะถูกบันทึกใน Lead นี้</span>
              </div>
            )}

            {/* ── Unified compose area (no step switching) ── */}

            {/* CC / BCC toggle */}
            <div className="flex items-center gap-2">
              <button onClick={() => setShowCcBcc((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                {showCcBcc ? <ChevronDown className="h-3 w-3" /> : <ChevronDown className="h-3 w-3 -rotate-90" />}
                CC / BCC
              </button>
              {(cc || bcc) && <span className="text-[10px] text-primary">• มี CC/BCC</span>}
            </div>
            {showCcBcc && (
              <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/20 p-3">
                <div className="space-y-1">
                  <Label className="text-xs">CC</Label>
                  <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="email@example.com" className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">BCC</Label>
                  <Input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="email@example.com" className="h-8 text-xs" />
                </div>
              </div>
            )}

            {/* Subject */}
            <div className="space-y-1.5">
              <Label className="text-xs">หัวเรื่อง</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="หัวเรื่องอีเมล" className="text-sm" />
            </div>

            {/* Body */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">เนื้อหา</Label>
                <div className="flex items-center gap-2">
                  {/* AI Draft button — top right */}
                  {aiReady && (
                    <button
                      onClick={() => setShowAiPanel((v) => !v)}
                      className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors ${
                        showAiPanel
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border hover:border-primary hover:text-primary"
                      }`}
                    >
                      <Sparkles className="h-3 w-3" /> ร่างด้วย AI
                    </button>
                  )}
                  <button
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={() => setSaveOpen(true)}
                    disabled={!subject.trim() || !body.trim()}
                  >
                    <Save className="h-3 w-3" /> บันทึก template
                  </button>
                </div>
              </div>

              {/* AI panel — collapsible */}
              {showAiPanel && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-primary flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" /> บอก AI ว่าต้องการสื่ออะไร
                    </p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 text-[11px] gap-1 text-muted-foreground">
                          ตัวอย่าง <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        {QUICK_BRIEFS.map((q) => (
                          <DropdownMenuItem key={q.label} onSelect={() => setBrief(q.text)}>
                            {q.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <Textarea
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    placeholder="เช่น ติดตามผลหลังส่งใบเสนอราคา ถามว่าตัดสินใจได้ยัง"
                    rows={3}
                    className="resize-none text-xs bg-background"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    onClick={async () => { await handleDraft(); setShowAiPanel(false); }}
                    disabled={drafting || !brief.trim()}
                    className="w-full"
                  >
                    {drafting
                      ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />กำลังร่าง…</>
                      : <><Sparkles className="mr-1.5 h-3.5 w-3.5" />ร่างให้เลย</>}
                  </Button>
                </div>
              )}

              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                className="resize-y text-sm"
                placeholder={!subject && !body ? "คลิก template ด้านซ้าย หรือเขียนเนื้อหาโดยตรง" : ""}
              />
            </div>

            {/* Attachments row */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                {/* From Media Library */}
                <button
                  onClick={() => setShowAttachPicker((v) => !v)}
                  className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  <Paperclip className="h-3 w-3" /> แนบจาก Media Library
                </button>
                {/* Upload file directly */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  <Plus className="h-3 w-3" /> อัปโหลดไฟล์
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 10 * 1024 * 1024) { toast.error("ไฟล์ใหญ่เกิน 10MB"); return; }
                    const fakeAtt = {
                      id: crypto.randomUUID(),
                      filename: file.name,
                      mime_type: file.type || "application/octet-stream",
                      public_url: URL.createObjectURL(file),
                      size: file.size,
                      _file: file,
                    };
                    setPendingAttachments((p) => [...p, fakeAtt as any]);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                    toast.success(`เพิ่มไฟล์ "${file.name}" แล้ว`);
                  }}
                />
              </div>

              {/* Media Library picker */}
              {showAttachPicker && (
                <div className="rounded-xl border bg-card overflow-hidden max-h-44 overflow-y-auto">
                  {mediaFiles.length === 0 ? (
                    <p className="p-3 text-xs text-muted-foreground">ยังไม่มีไฟล์ — อัปโหลดที่ Settings &gt; Media Library</p>
                  ) : (
                    <ul className="divide-y">
                      {mediaFiles.map((f) => {
                        const checked = pendingAttachments.some((a) => a.id === f.id);
                        return (
                          <li
                            key={f.id}
                            onClick={() => {
                              if (checked) {
                                setPendingAttachments((p) => p.filter((a) => a.id !== f.id));
                              } else {
                                setPendingAttachments((p) => [...p, f]);
                              }
                            }}
                            className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors ${checked ? "bg-primary/5" : ""}`}
                          >
                            <div className={`h-3.5 w-3.5 shrink-0 rounded border-2 flex items-center justify-center ${checked ? "border-primary bg-primary" : "border-muted-foreground/40"}`}>
                              {checked && <span className="text-[8px] text-white font-bold">✓</span>}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate">{f.name}</p>
                              <p className="text-[10px] text-muted-foreground">{f.filename} · {(f.size/1024/1024).toFixed(1)}MB</p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              {/* Pending attachments list */}
              {pendingAttachments.length > 0 && (
                <div className="space-y-1">
                  {pendingAttachments.map((att) => (
                    <div key={att.id} className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-1.5">
                      <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate text-xs">{att.filename}</span>
                      <span className="text-[10px] text-muted-foreground">{(att.size/1024/1024).toFixed(1)}MB</span>
                      <button onClick={() => setPendingAttachments((p) => p.filter((x) => x.id !== att.id))}>
                        <XIcon className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Send button */}
            <Button
              onClick={handleSend}
              disabled={sending || !to || !subject || !body}
              size="lg"
              className="w-full h-12 text-base font-semibold shadow-md hover:shadow-lg transition-shadow"
            >
              {sending
                ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />กำลังส่ง…</>
                : <><Send className="mr-2 h-5 w-5" />ส่งอีเมล{pendingAttachments.length > 0 ? ` (${pendingAttachments.length} ไฟล์แนบ)` : ""}</>}
            </Button>
          </div>
        </div>

        {/* ── History + AI info panel ── */}
        <div className="space-y-4">
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
