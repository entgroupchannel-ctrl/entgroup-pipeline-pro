/**
 * AccountEmailDialog — ส่งอีเมลถึงลูกค้าพร้อม template picker
 */
import { useEffect, useRef, useState } from "react";
import {
  Loader2, Send, Paperclip, X, ChevronDown, ChevronUp,
  Globe, User, Search, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { crmDb } from "@/lib/crm";
import { useAuth } from "@/lib/auth-context";
import { sendLeadEmail } from "@/lib/lead-email.functions";

interface EmailTemplate {
  id: string; name: string; category: string; subject: string; body: string;
  is_system: boolean; attachments: string[];
}
interface Contact { id: string; name: string; email: string | null; position: string | null; }
interface MediaFile { id: string; name: string; filename: string; size: number; mime_type: string; public_url: string; storage_path: string; }
interface PendingAttachment { id: string; filename: string; mime_type: string; public_url: string; size: number; storage_path?: string; }

const CATS = ["แนะนำองค์กร","ใบเสนอราคา","Follow Up","สินค้าและบริการ","โปรโมชัน","ทั่วไป"];

function applyMergeTags(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, k) => vars[k.trim()] ?? `{{${k.trim()}}}`);
}
function fmtSize(b: number) { return b < 1024*1024 ? `${(b/1024).toFixed(0)}KB` : `${(b/1024/1024).toFixed(1)}MB`; }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accountId: string;
  accountName: string;
}

export function AccountEmailDialog({ open, onOpenChange, accountId, accountName }: Props) {
  const { user, profile } = useAuth() as any;
  const doSend = useServerFn(sendLeadEmail);
  const fileRef = useRef<HTMLInputElement>(null);

  const [templates, setTemplates]   = useState<EmailTemplate[]>([]);
  const [contacts, setContacts]     = useState<Contact[]>([]);
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [toEmail, setToEmail] = useState("");
  const [toName, setToName]   = useState("");
  const [cc, setCc]   = useState("");
  const [bcc, setBcc] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody]       = useState("");
  const [pendingAtts, setPendingAtts] = useState<PendingAttachment[]>([]);
  const [showAttPicker, setShowAttPicker] = useState(false);
  const [tplSearch, setTplSearch] = useState("");
  const [sending, setSending]     = useState(false);
  const [tab, setTab] = useState<"tpl"|"compose">("tpl");

  useEffect(() => {
    if (!open) return;
    setSelectedContact(null); setToEmail(""); setToName(""); setSubject(""); setBody("");
    setPendingAtts([]); setCc(""); setBcc(""); setTplSearch(""); setTab("tpl");
    Promise.all([
      crmDb().from("email_templates").select("*").eq("is_active", true)
        .order("is_system", { ascending: false }).order("category").order("name"),
      crmDb().from("contacts").select("id,name,email,position").eq("account_id", accountId).order("name"),
      crmDb().from("email_attachments").select("id,name,filename,size,mime_type,public_url,storage_path").order("created_at", { ascending: false }),
    ]).then(([tpl, ct, med]) => {
      setTemplates((tpl.data ?? []) as EmailTemplate[]);
      const loadedContacts = (ct.data ?? []) as Contact[];
      setContacts(loadedContacts);
      setMediaFiles((med.data ?? []) as MediaFile[]);
      // Auto-select first contact that has email
      const firstWithEmail = loadedContacts.find((c) => c.email);
      if (firstWithEmail) {
        setSelectedContact(firstWithEmail);
        setToEmail(firstWithEmail.email!);
        setToName(firstWithEmail.name);
        setTab("compose");
      }
    });
  }, [open, accountId]);

  const applyTemplate = async (t: EmailTemplate) => {
    const vars: Record<string, string> = {
      "ชื่อผู้รับ":  toName || selectedContact?.name || "คุณลูกค้า",
      "ชื่อบริษัท": accountName,
      "ชื่อผู้ส่ง":  profile?.full_name || user?.email || "",
      "เลขดีล": "", "มูลค่าดีล": "",
      "วันที่วันนี้": new Date().toLocaleDateString("th-TH", { year:"numeric", month:"long", day:"numeric" }),
    };
    setSubject(applyMergeTags(t.subject, vars));
    setBody(applyMergeTags(t.body, vars));
    setTab("compose");
    const ids = t.attachments ?? [];
    if (ids.length) {
      const { data } = await crmDb().from("email_attachments").select("id,filename,mime_type,public_url,size,storage_path").in("id", ids);
      setPendingAtts((data ?? []) as PendingAttachment[]);
    }
    toast.success(`โหลด: ${t.name}`);
  };

  const handleSend = async () => {
    const email = toEmail.trim() || selectedContact?.email || "";
    if (!email)          { toast.error("กรุณาระบุอีเมลผู้รับ"); return; }
    if (!subject.trim()) { toast.error("กรุณาระบุหัวเรื่อง");   return; }
    if (!body.trim())    { toast.error("กรุณาระบุเนื้อหา");     return; }
    setSending(true);
    try {
      const attachments: { filename: string; content: string; type: string }[] = [];
      for (const att of pendingAtts) {
        try {
          const resp = await fetch(att.public_url);
          const blob = await resp.blob();
          const b64 = await new Promise<string>((res) => {
            const r = new FileReader(); r.onload = () => res((r.result as string).split(",")[1]); r.readAsDataURL(blob);
          });
          attachments.push({ filename: att.filename, content: b64, type: att.mime_type });
        } catch { /* skip */ }
      }
      await doSend({ data: {
        to:         email,
        to_name:    (toName || selectedContact?.name || "").trim() || undefined,
        subject:    subject.trim(),
        body:       body.trim(),
        cc:         cc.trim() || undefined,
        bcc:        bcc.trim() || undefined,
        account_id: accountId,
        contact_id: selectedContact?.id,
        source:     "account_list",
        attachments: attachments.length > 0 ? attachments : undefined,
      }});
      toast.success("ส่งอีเมลแล้ว ✓", { description: `ถึง ${toName || email} · ${accountName}` });
      onOpenChange(false);
    } catch (e: any) {
      toast.error("ส่งไม่สำเร็จ", { description: e?.message });
    } finally { setSending(false); }
  };

  const tplFiltered = templates.filter((t) =>
    !tplSearch.trim() || t.name.toLowerCase().includes(tplSearch.toLowerCase()) || t.category.toLowerCase().includes(tplSearch.toLowerCase())
  );
  const emailToSend = toEmail.trim() || selectedContact?.email || "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-3.5 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Send className="h-4 w-4 text-primary" />
            ส่งอีเมลถึง <span className="text-primary font-semibold">{accountName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">

          {/* LEFT: Template sidebar */}
          <div className="w-52 shrink-0 border-r flex flex-col overflow-hidden bg-muted/10">
            <div className="border-b px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Email Templates</p>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input value={tplSearch} onChange={(e) => setTplSearch(e.target.value)}
                  placeholder="ค้นหา..." className="pl-6 h-7 text-xs" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {CATS.map((cat) => {
                const catTpls = tplFiltered.filter((t) => t.is_system && t.category === cat);
                if (!catTpls.length) return null;
                return (
                  <div key={cat} className="mb-2">
                    <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{cat}</p>
                    {catTpls.map((t) => (
                      <button key={t.id} onClick={() => applyTemplate(t)}
                        className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-primary/5 transition-colors group">
                        <Globe className="mt-0.5 h-3 w-3 shrink-0 text-blue-400" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate group-hover:text-primary">{t.name}</p>
                          {(t.attachments?.length ?? 0) > 0 && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Paperclip className="h-2.5 w-2.5" />{t.attachments.length} ไฟล์
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })}
              {tplFiltered.filter(t => !t.is_system).length > 0 && (
                <div className="border-t pt-1 mb-2">
                  <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">ส่วนตัว</p>
                  {tplFiltered.filter(t => !t.is_system).map((t) => (
                    <button key={t.id} onClick={() => applyTemplate(t)}
                      className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-primary/5 transition-colors group">
                      <User className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                      <p className="text-xs font-medium truncate group-hover:text-primary">{t.name}</p>
                    </button>
                  ))}
                </div>
              )}
              {tplFiltered.length === 0 && <p className="px-3 py-6 text-xs text-muted-foreground text-center">ไม่พบ template</p>}
            </div>
          </div>

          {/* RIGHT: Compose */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b shrink-0 bg-muted/5">
              {(["tpl","compose"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${tab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                  {t === "tpl" ? "📋 เลือก Template" : "✏️ แก้ไขและส่ง"}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {tab === "tpl" ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">คลิก template ด้านซ้าย หรือเลือกจากรายการด้านล่างเพื่อโหลดเนื้อหา</p>
                  <div className="grid grid-cols-2 gap-2">
                    {templates.filter(t => t.is_system).slice(0,6).map((t) => (
                      <button key={t.id} onClick={() => applyTemplate(t)}
                        className="flex items-start gap-2 rounded-xl border bg-card p-3 text-left hover:border-primary/40 hover:bg-primary/5 transition-colors">
                        <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold">{t.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate mt-0.5">{t.subject.slice(0,40)}</p>
                          {(t.attachments?.length ?? 0) > 0 && (
                            <p className="text-[10px] text-primary/70 flex items-center gap-0.5 mt-0.5">
                              <Paperclip className="h-2.5 w-2.5" />{t.attachments.length} ไฟล์แนบ
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                  <Button size="sm" variant="outline" className="w-full" onClick={() => setTab("compose")}>
                    เขียนเองโดยไม่ใช้ template →
                  </Button>
                </div>
              ) : (
                <>
                  {/* Recipient */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">ผู้รับ</Label>
                    {contacts.length > 0 && (
                      <Select value={selectedContact?.id ?? "__manual__"} onValueChange={(v) => {
                        if (v === "__manual__") { setSelectedContact(null); setToEmail(""); setToName(""); }
                        else {
                          const c = contacts.find(c => c.id === v) ?? null;
                          setSelectedContact(c);
                          if (c?.email) setToEmail(c.email);
                          if (c?.name) setToName(c.name);
                        }
                      }}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="เลือกผู้ติดต่อ..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__manual__">— ระบุเอง —</SelectItem>
                          {contacts.map((c) => (
                            <SelectItem key={c.id} value={c.id} disabled={!c.email}>
                              <div className="flex flex-col py-0.5">
                                <span className="font-medium text-sm">{c.name}{c.position ? ` · ${c.position}` : ""}</span>
                                {c.email
                                  ? <span className="text-xs text-primary/70">{c.email}</span>
                                  : <span className="text-xs text-amber-600">ไม่มีอีเมล</span>}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {(!selectedContact) && (
                      <div className="grid grid-cols-2 gap-2">
                        <div><Label className="text-xs">ชื่อผู้รับ</Label>
                          <Input value={toName} onChange={(e) => setToName(e.target.value)} placeholder="คุณชื่อ..." className="h-8 text-sm mt-1" /></div>
                        <div><Label className="text-xs">อีเมล *</Label>
                          <Input type="email" value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder="email@example.com" className="h-8 text-sm mt-1" /></div>
                      </div>
                    )}
                    {selectedContact && !selectedContact.email && (
                      <div><Label className="text-xs text-amber-600">⚠ ไม่มีอีเมล — กรอกเพิ่มเติม</Label>
                        <Input type="email" value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder="email@example.com" className="h-8 border-amber-300 mt-1" /></div>
                    )}
                  </div>

                  {/* CC/BCC */}
                  <button onClick={() => setShowCcBcc(v => !v)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    {showCcBcc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3 -rotate-90" />}
                    CC / BCC {(cc||bcc) && "•"}
                  </button>
                  {showCcBcc && (
                    <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/20 p-2.5">
                      <div><Label className="text-xs">CC</Label><Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="email@..." className="h-7 text-xs mt-1" /></div>
                      <div><Label className="text-xs">BCC</Label><Input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="email@..." className="h-7 text-xs mt-1" /></div>
                    </div>
                  )}

                  {/* Subject + Body */}
                  <div><Label className="text-xs">หัวเรื่อง</Label>
                    <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="หัวเรื่องอีเมล" className="mt-1" /></div>
                  <div><Label className="text-xs">เนื้อหา</Label>
                    <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} className="resize-none text-sm mt-1"
                      placeholder="เนื้อหาอีเมล หรือคลิก template ด้านซ้าย" /></div>

                  {/* Attachments */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setShowAttPicker(v => !v)}
                        className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                        <Paperclip className="h-3 w-3" /> แนบจาก Media Library
                      </button>
                      <button onClick={() => fileRef.current?.click()}
                        className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                        <Plus className="h-3 w-3" /> อัปโหลดไฟล์
                      </button>
                      <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]; if (!file) return;
                          if (file.size > 10*1024*1024) { toast.error("ไฟล์ใหญ่เกิน 10MB"); return; }
                          setPendingAtts(p => [...p, { id: crypto.randomUUID(), filename: file.name, mime_type: file.type||"application/octet-stream", public_url: URL.createObjectURL(file), size: file.size } as any]);
                          if (fileRef.current) fileRef.current.value = "";
                        }} />
                    </div>
                    {showAttPicker && (
                      <div className="rounded-xl border bg-card overflow-hidden max-h-36 overflow-y-auto">
                        {mediaFiles.length === 0
                          ? <p className="p-3 text-xs text-muted-foreground">ยังไม่มีไฟล์ใน Media Library</p>
                          : mediaFiles.map((f) => {
                              const checked = pendingAtts.some(a => a.id === f.id);
                              return (
                                <div key={f.id} onClick={() => checked ? setPendingAtts(p => p.filter(a => a.id !== f.id)) : setPendingAtts(p => [...p, f])}
                                  className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/40 border-b last:border-0 ${checked ? "bg-primary/5" : ""}`}>
                                  <div className={`h-3.5 w-3.5 shrink-0 rounded border-2 flex items-center justify-center ${checked ? "border-primary bg-primary" : "border-muted-foreground/40"}`}>
                                    {checked && <span className="text-[8px] text-white font-bold">✓</span>}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium truncate">{f.name}</p>
                                    <p className="text-[10px] text-muted-foreground">{fmtSize(f.size)}</p>
                                  </div>
                                </div>
                              );
                            })}
                      </div>
                    )}
                    {pendingAtts.length > 0 && (
                      <div className="space-y-1">
                        {pendingAtts.map((att) => (
                          <div key={att.id} className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-1.5">
                            <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="flex-1 truncate text-xs">{att.filename}</span>
                            <span className="text-[10px] text-muted-foreground">{fmtSize(att.size)}</span>
                            <button onClick={() => setPendingAtts(p => p.filter(x => x.id !== att.id))}>
                              <X className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="border-t px-4 py-3 shrink-0 flex items-center justify-between gap-3 bg-muted/5">
              <p className="text-xs text-muted-foreground truncate flex-1">
                {emailToSend ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                    ✓ {toName || selectedContact?.name || "ผู้รับ"} · {emailToSend}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">ยังไม่ได้เลือกผู้รับ</span>
                )}
              </p>
              <div className="flex gap-2 shrink-0">
                {tab === "tpl" && (
                  <Button variant="outline" size="sm" onClick={() => setTab("compose")}>แก้ไขและส่ง →</Button>
                )}
                <Button size="sm" onClick={handleSend} disabled={sending || !emailToSend || !subject || !body}>
                  {sending
                    ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />กำลังส่ง…</>
                    : <><Send className="mr-1.5 h-3.5 w-3.5" />ส่งอีเมล{pendingAtts.length > 0 ? ` (${pendingAtts.length})` : ""}</>}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
