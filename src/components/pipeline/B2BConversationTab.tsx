/**
 * B2BConversationTab — 3 sub-tab chat viewer
 *
 * Tab 1 "ใบเสนอราคา B2B"  → quote_messages (B2B project ugzd..., via b2b-live-chat edge fn)
 * Tab 2 "Chat หน้าเว็บ"    → chat_sessions (user_id IS NULL = guest)  + chat_messages
 * Tab 3 "General Chat"     → chat_sessions (user_id IS NOT NULL = member) + chat_messages
 *
 * Tab 1 ต่างกัน: ผู้ส่งคือ customer ที่กรอกใบเสนอราคา B2B
 * Tab 2-3 ใช้ table เดียวกัน แยกด้วย user_id NULL/NOT NULL
 * Authorized by: therdpoom@entgroup.co.th
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Loader2, RefreshCw, MessageSquare, Send, Building2,
  Phone, Mail, Search, CheckCircle2, AlertTriangle,
  ShoppingCart, Globe, Users, X, Paperclip, Image as ImageIcon, FileText, CornerDownLeft,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { formatBaht } from "@/lib/format";
import { crmDb } from "@/lib/crm";
import { STATUS_LABEL, STATUS_COLOR, fetchUnmatchedQuotes } from "@/lib/b2b-client";

// ─── Config ──────────────────────────────────────────────────────────────────
const LIVE_CHAT_URL = "https://ugzdwmyylqmirrljtuej.supabase.co/functions/v1/b2b-live-chat";
const CRM_SECRET    = "entgroup-crm-secret-2026";

type ChatTab = "b2b" | "web" | "general";

const TAB_CONFIG: Record<ChatTab, { label: string; icon: typeof MessageSquare; color: string; desc: string }> = {
  b2b:     { label: "ใบเสนอราคา B2B", icon: ShoppingCart, color: "text-blue-600",   desc: "ลูกค้าที่ยื่นขอใบเสนอราคา" },
  web:     { label: "Chat หน้าเว็บ",   icon: Globe,        color: "text-teal-600",   desc: "ผู้เยี่ยมชมกดปุ่ม chat" },
  general: { label: "General Chat",   icon: Users,        color: "text-purple-600", desc: "สมาชิก / ผู้ใช้ที่ล็อกอิน" },
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface B2BConvo {
  id: string; quote_number: string; customer_name: string;
  customer_company: string; customer_email?: string; customer_phone?: string;
  customer_address?: string | null; grand_total: number; status: string;
  created_at: string; sla_po_review_due?: string | null; crm_lead_id?: string | null;
  last_message: any | null; unread_count: number; _lead_id?: string | null;
}
interface B2BMsg {
  id: string; quote_id: string; sender_name: string; sender_role: string;
  content: string; created_at: string; read_by: any;
}

interface WebSession {
  id: string; guest_name: string | null; guest_email: string | null;
  guest_phone: string | null; user_id: string | null; source: string;
  status: string; last_message_at: string | null; created_at: string;
  assigned_to: string | null; metadata: any | null;
  _last_msg?: string; _unread?: number; _sender_type?: string;
}
interface WebMsg {
  id: string; session_id: string; content: string; sender_name: string;
  sender_type: string; created_at: string; read_at: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MONTHS_TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
function fmtDate(iso: string) {
  const d = new Date(iso), now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  if (diff < 7) return `${diff} วันที่ผ่านมา`;
  return `${d.getDate()} ${MONTHS_TH[d.getMonth()]}`;
}
function fmtFull(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_TH[d.getMonth()]} ${d.getFullYear()+543} ${d.toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"})}`;
}

async function lcFetch(params: Record<string,string> = {}) {
  const url = new URL(LIVE_CHAT_URL);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k,v));
  const res = await fetch(url.toString(), { headers: { "x-crm-secret": CRM_SECRET } });
  if (!res.ok) throw new Error(`b2b-live-chat ${res.status}`);
  return res.json();
}
async function lcPost(body: Record<string,any>) {
  const res = await fetch(LIVE_CHAT_URL, {
    method: "POST",
    headers: { "x-crm-secret": CRM_SECRET, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`b2b-live-chat POST ${res.status}`);
  return res.json();
}

// ─── Attachment helpers ──────────────────────────────────────────────────────
const ATTACH_BUCKET = "email-attachments";
const MAX_ATTACH_MB = 10;
const IMG_RE = /(https?:\/\/[^\s)]+\.(?:png|jpe?g|gif|webp|svg))(?:\?[^\s)]*)?/gi;
const URL_RE = /(https?:\/\/[^\s)]+)/gi;

type Attachment = { url: string; name: string; mime: string; size: number };

function isImageUrl(u: string) { return /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(u); }

// ─── Chat Bubble ──────────────────────────────────────────────────────────────
function Bubble({ content, senderName, isMe, createdAt }: {
  content: string; senderName: string; isMe: boolean; createdAt: string;
}) {
  const imgs = useMemo(() => Array.from(content.matchAll(IMG_RE)).map(m => m[0]), [content]);
  const textOnly = content.replace(IMG_RE, "").trim();
  const linkified = textOnly.split(URL_RE).map((part, i) =>
    URL_RE.test(part)
      ? <a key={i} href={part} target="_blank" rel="noreferrer" className="underline break-all">{part}</a>
      : <span key={i}>{part}</span>
  );
  return (
    <div className={`flex gap-2.5 ${isMe ? "flex-row-reverse" : ""}`}>
      <div className={`size-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold ${
        isMe ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
      }`}>
        {isMe ? "S" : (senderName?.[0]?.toUpperCase() ?? "?")}
      </div>
      <div className={`max-w-[72%] flex flex-col ${isMe ? "items-end" : ""}`}>
        {!isMe && <span className="text-[11px] text-muted-foreground font-medium mb-0.5 px-1">{senderName}</span>}
        {textOnly && (
          <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
            isMe ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted text-foreground rounded-tl-sm"
          }`}>
            <p className="whitespace-pre-wrap break-words">{linkified}</p>
          </div>
        )}
        {imgs.length > 0 && (
          <div className={`mt-1 grid gap-1 ${imgs.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {imgs.map((u, i) => (
              <a key={i} href={u} target="_blank" rel="noreferrer" className="block">
                <img src={u} alt="attachment" className="max-h-56 rounded-lg border object-cover"/>
              </a>
            ))}
          </div>
        )}
        <span className={`text-[10px] text-muted-foreground mt-1 px-1 ${isMe ? "text-right" : ""}`}>
          {fmtFull(createdAt)}
        </span>
      </div>
    </div>
  );
}

// ─── Shared Thread Panel ──────────────────────────────────────────────────────
function ThreadPanel({ title, subtitle, infoRows, children, replyPlaceholder, onSend, onClose, sending, draftKey }: {
  title: string; subtitle?: string; infoRows?: React.ReactNode;
  children: React.ReactNode; replyPlaceholder: string;
  onSend: (text: string) => Promise<void>; onClose: () => void; sending: boolean;
  draftKey: string;
}) {
  const storageKey = `chat-draft:${draftKey}`;
  const attachKey  = `chat-attach:${draftKey}`;
  const [reply, setReply] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Load draft when conversation changes
  useEffect(() => {
    try {
      setReply(localStorage.getItem(storageKey) ?? "");
      const a = localStorage.getItem(attachKey);
      setAttachments(a ? JSON.parse(a) : []);
    } catch { setReply(""); setAttachments([]); }
  }, [storageKey, attachKey]);

  // Persist draft
  useEffect(() => {
    try {
      if (reply) localStorage.setItem(storageKey, reply);
      else localStorage.removeItem(storageKey);
    } catch {}
  }, [reply, storageKey]);
  useEffect(() => {
    try {
      if (attachments.length) localStorage.setItem(attachKey, JSON.stringify(attachments));
      else localStorage.removeItem(attachKey);
    } catch {}
  }, [attachments, attachKey]);

  // Autosize
  useLayoutEffect(() => {
    const el = taRef.current; if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [reply]);

  // Focus on conversation switch
  useEffect(() => { taRef.current?.focus(); }, [draftKey]);

  const handlePickFiles = () => fileRef.current?.click();

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded: Attachment[] = [];
      for (const file of Array.from(files)) {
        if (file.size > MAX_ATTACH_MB * 1024 * 1024) {
          toast.error(`${file.name} ใหญ่เกิน ${MAX_ATTACH_MB}MB`);
          continue;
        }
        const ext = file.name.split(".").pop() ?? "bin";
        const path = `chat/${Date.now()}-${crypto.randomUUID().slice(0,8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from(ATTACH_BUCKET).upload(path, file, {
          contentType: file.type || "application/octet-stream",
        });
        if (upErr) { toast.error(`อัปโหลด ${file.name} ไม่สำเร็จ`); continue; }
        const { data } = supabase.storage.from(ATTACH_BUCKET).getPublicUrl(path);
        uploaded.push({ url: data.publicUrl, name: file.name, mime: file.type, size: file.size });
      }
      if (uploaded.length) setAttachments(prev => [...prev, ...uploaded]);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeAttach = (idx: number) =>
    setAttachments(prev => prev.filter((_, i) => i !== idx));

  const handleSend = async () => {
    const t = reply.trim();
    if ((!t && attachments.length === 0) || sending) return;
    // Compose: text + newline + attachment URLs
    const attachLines = attachments.map(a => a.url).join("\n");
    const body = [t, attachLines].filter(Boolean).join("\n\n");
    await onSend(body);
    setReply("");
    setAttachments([]);
    try {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(attachKey);
    } catch {}
    requestAnimationFrame(() => taRef.current?.focus());
  };

  const onPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files ?? []);
    if (files.length) {
      e.preventDefault();
      const dt = new DataTransfer();
      files.forEach(f => dt.items.add(f));
      handleUpload(dt.files);
    }
  };

  return (
    <div className="flex flex-col border-l border-border bg-background" style={{height:"100%",overflow:"hidden"}}>
      <div className="flex items-start gap-3 px-5 py-4 border-b bg-muted/10 shrink-0">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground md:hidden shrink-0">
          <X className="size-5"/>
        </button>
      </div>
      {infoRows && (
        <div className="flex flex-wrap gap-3 px-5 py-2 border-b text-xs text-muted-foreground bg-muted/5 shrink-0">
          {infoRows}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">{children}</div>

      {/* Composer */}
      <div className="border-t bg-background shrink-0 mt-auto">
        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {attachments.map((a, i) => (
              <div key={i} className="relative group flex items-center gap-2 rounded-lg border bg-muted/40 pl-2 pr-7 py-1.5 text-xs max-w-[220px]">
                {isImageUrl(a.url) ? (
                  <img src={a.url} alt="" className="size-8 rounded object-cover shrink-0"/>
                ) : a.mime.startsWith("image/") ? (
                  <ImageIcon className="size-4 text-blue-500 shrink-0"/>
                ) : (
                  <FileText className="size-4 text-muted-foreground shrink-0"/>
                )}
                <span className="truncate">{a.name}</span>
                <button type="button" onClick={()=>removeAttach(i)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-background">
                  <X className="size-3"/>
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 px-4 py-3">
          <input ref={fileRef} type="file" multiple className="hidden"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            onChange={e => handleUpload(e.target.files)}/>
          <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0"
            onClick={handlePickFiles} disabled={uploading || sending} title="แนบไฟล์">
            {uploading ? <Loader2 className="size-4 animate-spin"/> : <Paperclip className="size-4"/>}
          </Button>
          <div className="flex-1 flex flex-col">
            <textarea ref={taRef} value={reply} onChange={e=>setReply(e.target.value)}
              onPaste={onPaste}
              onKeyDown={e=>{
                if (e.key==="Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault(); handleSend();
                }
              }}
              placeholder={replyPlaceholder} rows={1}
              className="w-full resize-none rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition min-h-[42px] max-h-[200px]"/>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1 px-1">
              <CornerDownLeft className="size-3"/> Enter ส่ง · Shift+Enter ขึ้นบรรทัดใหม่ · วางรูปได้
            </div>
          </div>
          <Button onClick={handleSend} disabled={sending||(!reply.trim() && attachments.length===0)}
            size="icon" className="size-10 rounded-xl shrink-0">
            {sending ? <Loader2 className="size-4 animate-spin"/> : <Send className="size-4"/>}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Shared Conversation List ─────────────────────────────────────────────────
function ConvoList<T>({ items, selectedId, loading, error, search, onSelect, onRetry, renderItem }: {
  items: T[]; selectedId?: string; loading: boolean; error: string|null;
  search: string; onSelect: (item: T) => void; onRetry: () => void;
  renderItem: (item: T, isActive: boolean) => React.ReactNode;
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      {loading && items.length === 0 ? (
        <div className="flex justify-center py-12"><Loader2 className="size-5 animate-spin text-muted-foreground"/></div>
      ) : error ? (
        <div className="p-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center dark:border-amber-900/40 dark:bg-amber-950/20">
            <AlertTriangle className="mx-auto mb-2 size-5 text-amber-600"/>
            <p className="text-xs font-medium text-amber-800 dark:text-amber-300">{error}</p>
            <Button size="sm" variant="outline" className="mt-3 h-7 text-xs" onClick={onRetry}>
              <RefreshCw className="mr-1 size-3"/> ลองใหม่
            </Button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <MessageSquare className="size-8 opacity-20 mb-2"/>
          <p className="text-sm">{search ? "ไม่พบรายการที่ค้นหา" : "ยังไม่มีการสนทนา"}</p>
        </div>
      ) : items.map((item: any) => (
        <button key={item.id} type="button" onClick={() => onSelect(item)}
          className={`w-full text-left border-b border-border/50 transition-colors ${
            selectedId === item.id ? "bg-primary/8 border-l-2 border-l-primary" : "hover:bg-muted/30"
          }`}>
          {renderItem(item, selectedId === item.id)}
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1 — B2B Quote Chat
// ═══════════════════════════════════════════════════════════════════════════════
function B2BTab({ staffName, staffId }: { staffName: string; staffId: string }) {
  const [convos,   setConvos]   = useState<B2BConvo[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string|null>(null);
  const [search,   setSearch]   = useState("");
  const [selected, setSelected] = useState<B2BConvo|null>(null);
  const [msgs,     setMsgs]     = useState<B2BMsg[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending,  setSending]  = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // ใช้ b2b-quotes edge function เดิม (ทำงานได้แน่นอน)
      const raw = await fetchUnmatchedQuotes(100);
      const filtered = search
        ? raw.filter(r =>
            r.quote_number.toLowerCase().includes(search.toLowerCase()) ||
            r.customer_company.toLowerCase().includes(search.toLowerCase()) ||
            r.customer_name.toLowerCase().includes(search.toLowerCase()))
        : raw;
      const items: B2BConvo[] = filtered.map(r => ({
        ...r,
        last_message: null, unread_count: 0, _lead_id: null,
      }));
      const ids = items.map(r=>r.id).filter(Boolean);
      if (ids.length) {
        const { data: leads } = await crmDb().from("leads").select("id,b2b_request_id").in("b2b_request_id", ids);
        const lm: Record<string,string> = {};
        for (const l of (leads??[]) as any[]) if (l.b2b_request_id) lm[l.b2b_request_id]=l.id;
        items.forEach(c => { c._lead_id = lm[c.id]??null; });
      }
      setConvos(items);
      if (items.length && !selected) setSelected(items[0]);
    } catch(e:any) { setError(e.message); }
    finally { setLoading(false); }
  }, [search]);

  const loadMsgs = useCallback(async (id: string) => {
    setLoadingMsgs(true);
    try {
      const { data } = await lcFetch({ action: "b2b", quote_id: id });
      setMsgs(data ?? []);
      lcPost({ mark_read: true, quote_id: id, staff_id: staffId }).catch(()=>{});
    } catch(e:any) { toast.error("โหลดข้อความไม่สำเร็จ"); }
    finally { setLoadingMsgs(false); }
  }, [staffId]);

  useEffect(() => { load(); }, []);
  useEffect(() => { const t=setTimeout(()=>load(),400); return()=>clearTimeout(t); }, [search]);
  useEffect(() => { if (selected) loadMsgs(selected.id); }, [selected?.id]);
  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:"smooth"}); }, [msgs]);

  const handleSend = async (text: string) => {
    if (!selected) return;
    setSending(true);
    try {
      await lcPost({ action: "b2b", quote_id: selected.id, sender_name: staffName, content: text });
      await loadMsgs(selected.id);
      setConvos(prev => prev.map(c => c.id===selected.id ? {...c, unread_count:0} : c));
    } catch(e:any) { toast.error("ส่งไม่สำเร็จ: "+e.message); }
    finally { setSending(false); }
  };

  const totalUnread = convos.reduce((s,c)=>s+c.unread_count,0);

  return (
    <div style={{display:"flex",height:"100%",overflow:"hidden"}}>
      {/* List */}
      <div className={`flex flex-col border-r border-border bg-background ${selected?"hidden md:flex w-[380px] shrink-0":"flex flex-1"}`}>
        <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0">
          <span className="text-xs text-muted-foreground flex-1">
            {convos.length} รายการ {totalUnread>0 && <span className="text-red-500 font-medium">· {totalUnread} ใหม่</span>}
          </span>
          <Button variant="ghost" size="icon" className="size-7" onClick={load} disabled={loading}>
            <RefreshCw className={`size-3.5 ${loading?"animate-spin":""}`}/>
          </Button>
        </div>
        <div className="px-3 py-2 border-b shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"/>
            <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหา..." className="pl-7 h-7 text-xs"/>
          </div>
        </div>
        <ConvoList items={convos} selectedId={selected?.id} loading={loading} error={error}
          search={search} onSelect={setSelected} onRetry={load}
          renderItem={(c: B2BConvo, isActive) => (
            <div className="flex items-start gap-3 px-4 py-3.5">
              <div className={`size-9 rounded-full flex items-center justify-center font-semibold text-sm shrink-0 ${
                c.unread_count>0?"bg-blue-600 text-white":"bg-muted text-muted-foreground"}`}>
                {c.customer_company?.[0]?.toUpperCase()??c.customer_name?.[0]??"?"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-sm truncate ${c.unread_count>0?"font-bold":"font-medium"}`}>
                    {c.customer_company||c.customer_name}
                  </span>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {c.last_message?fmtDate(c.last_message.created_at):fmtDate(c.created_at)}
                  </span>
                </div>
                <p className={`text-xs truncate mt-0.5 ${c.unread_count>0?"text-foreground":"text-muted-foreground"}`}>
                  {c.last_message?.content??(c.quote_number+" · "+formatBaht(c.grand_total))}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[10px] font-mono text-muted-foreground">{c.quote_number}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLOR[c.status]??"bg-muted text-muted-foreground"}`}>
                    {STATUS_LABEL[c.status]??c.status}
                  </span>
                  {c._lead_id && <CheckCircle2 className="size-3 text-emerald-500"/>}
                </div>
              </div>
              {c.unread_count>0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white shrink-0">
                  {c.unread_count}
                </span>
              )}
            </div>
          )}
        />
      </div>

      {/* Thread */}
      {selected ? (
        <div className="flex-1 min-w-0">
          <ThreadPanel
            draftKey={`b2b:${selected.id}`}
            title={selected.customer_company||selected.customer_name}
            subtitle={`${selected.quote_number} · ${formatBaht(selected.grand_total)}`}
            infoRows={<>
              {selected.customer_phone && <a href={`tel:${selected.customer_phone}`} className="flex items-center gap-1 hover:text-foreground"><Phone className="size-3"/>{selected.customer_phone}</a>}
              {selected.customer_email && <a href={`mailto:${selected.customer_email}`} className="flex items-center gap-1 hover:text-foreground"><Mail className="size-3"/>{selected.customer_email}</a>}
              {selected._lead_id && <a href={`/leads/${selected._lead_id}`} className="flex items-center gap-1 text-primary hover:underline"><CheckCircle2 className="size-3"/> Lead ใน CRM</a>}
            </>}
            replyPlaceholder={`ตอบกลับ ${selected.customer_company||selected.customer_name}...`}
            onSend={handleSend} onClose={()=>setSelected(null)} sending={sending}
          >
            {loadingMsgs ? (
              <div className="flex justify-center py-12"><Loader2 className="size-5 animate-spin text-muted-foreground"/></div>
            ) : msgs.length===0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-muted-foreground gap-2">
                <MessageSquare className="size-10 opacity-20"/>
                <p className="text-sm">ยังไม่มีข้อความ</p>
              </div>
            ) : msgs.map(m => (
              <Bubble key={m.id} content={m.content} senderName={m.sender_name}
                isMe={m.sender_role==="staff"} createdAt={m.created_at}/>
            ))}
            <div ref={bottomRef}/>
          </ThreadPanel>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground flex-col gap-2">
          <ShoppingCart className="size-10 opacity-20"/>
          <p className="text-sm">เลือกการสนทนาจากรายการ</p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2 & 3 — Web Chat / General Chat (via b2b-live-chat edge function)
// chat_sessions อยู่ใน B2B project — ต้องผ่าน edge function เท่านั้น
// ═══════════════════════════════════════════════════════════════════════════════
function WebChatTab({ isGuest, staffName }: { isGuest: boolean; staffName: string }) {
  const [sessions,  setSessions]  = useState<WebSession[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string|null>(null);
  const [search,    setSearch]    = useState("");
  const [selected,  setSelected]  = useState<WebSession|null>(null);
  const [msgs,      setMsgs]      = useState<WebMsg[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending,   setSending]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const chatAction = isGuest ? "web" : "general";

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params: Record<string,string> = { action: chatAction };
      if (search) params.search = search;
      const { data, error: err } = await lcFetch(params);
      if (err) throw new Error(err);
      const items: WebSession[] = (data ?? []).map((s: any) => ({
        ...s,
        _last_msg: s.last_message?.content ?? "",
        _sender_type: s.last_message?.sender_type ?? "",
        _unread: s.unread_count ?? 0,
      }));
      setSessions(items);
      if (items.length && !selected) setSelected(items[0]);
    } catch(e:any) { setError(e.message); }
    finally { setLoading(false); }
  }, [isGuest, search]);

  const loadMsgs = useCallback(async (sessionId: string) => {
    setLoadingMsgs(true);
    try {
      const { data } = await lcFetch({ action: chatAction, session_id: sessionId });
      setMsgs(data ?? []);
      await lcPost({ action: `${chatAction}_read`, session_id: sessionId });
    } catch { toast.error("โหลดข้อความไม่สำเร็จ"); }
    finally { setLoadingMsgs(false); }
  }, [chatAction]);

  useEffect(() => { load(); }, [isGuest]);
  useEffect(() => { const t=setTimeout(()=>load(),400); return()=>clearTimeout(t); }, [search]);
  useEffect(() => { if (selected) loadMsgs(selected.id); }, [selected?.id]);
  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:"smooth"}); }, [msgs]);

  const handleSend = async (text: string) => {
    if (!selected) return;
    setSending(true);
    try {
      await lcPost({ action: `${chatAction}_send`, session_id: selected.id, sender_name: staffName, content: text });
      await loadMsgs(selected.id);
      setSessions(prev => prev.map(s => s.id===selected.id ? {...s, _unread:0} : s));
    } catch(e:any) { toast.error("ส่งไม่สำเร็จ: "+e.message); }
    finally { setSending(false); }
  };

  const totalUnread = sessions.reduce((s,c)=>s+(c._unread??0), 0);
  const displayName = (s: WebSession) =>
    s.guest_name ?? s.guest_email ?? (s.user_id ? "สมาชิก" : "ผู้เยี่ยมชม");

  return (
    <div style={{display:"flex",height:"100%",overflow:"hidden"}}>
      {/* List */}
      <div className={`flex flex-col border-r border-border bg-background ${selected?"hidden md:flex w-[380px] shrink-0":"flex flex-1"}`}>
        <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0">
          <span className="text-xs text-muted-foreground flex-1">
            {sessions.length} รายการ {totalUnread>0 && <span className="text-red-500 font-medium">· {totalUnread} ใหม่</span>}
          </span>
          <Button variant="ghost" size="icon" className="size-7" onClick={load} disabled={loading}>
            <RefreshCw className={`size-3.5 ${loading?"animate-spin":""}`}/>
          </Button>
        </div>
        <div className="px-3 py-2 border-b shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"/>
            <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหา..." className="pl-7 h-7 text-xs"/>
          </div>
        </div>
        <ConvoList items={sessions} selectedId={selected?.id} loading={loading} error={error}
          search={search} onSelect={setSelected} onRetry={load}
          renderItem={(s: WebSession) => {
            const name = displayName(s);
            const hasUnread = (s._unread??0) > 0;
            const prefix = s._sender_type==="agent" ? "คุณ: " : "";
            return (
              <div className="flex items-start gap-3 px-4 py-3.5">
                <div className={`size-9 rounded-full flex items-center justify-center font-semibold text-sm shrink-0 ${
                  hasUnread
                    ? isGuest ? "bg-teal-600 text-white" : "bg-purple-600 text-white"
                    : "bg-muted text-muted-foreground"}`}>
                  {name[0]?.toUpperCase()??"?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-sm truncate ${hasUnread?"font-bold":"font-medium"}`}>{name}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {fmtDate(s.last_message_at??s.created_at)}
                    </span>
                  </div>
                  {s.guest_email && <p className="text-xs text-muted-foreground truncate">{s.guest_email}</p>}
                  <p className={`text-xs truncate mt-0.5 ${hasUnread?"text-foreground":"text-muted-foreground"}`}>
                    {prefix}{s._last_msg||"ยังไม่มีข้อความ"}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                      s.status==="open" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "bg-muted text-muted-foreground"}`}>
                    {s.status}
                    </span>
                    {s.assigned_to && <span title="มีคนรับแล้ว"><CheckCircle2 className="size-3 text-emerald-500"/></span>}
                  </div>
                </div>
                {hasUnread && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white shrink-0">
                    {s._unread}
                  </span>
                )}
              </div>
            );
          }}
        />
      </div>

      {/* Thread */}
      {selected ? (
        <div className="flex-1 min-w-0">
          <ThreadPanel
            draftKey={`${chatAction}:${selected.id}`}
            title={displayName(selected)}
            subtitle={isGuest ? "ผู้เยี่ยมชมหน้าเว็บ" : "สมาชิก / ผู้ใช้ที่ล็อกอิน"}
            infoRows={<>
              {selected.guest_phone && <a href={`tel:${selected.guest_phone}`} className="flex items-center gap-1 hover:text-foreground"><Phone className="size-3"/>{selected.guest_phone}</a>}
              {selected.guest_email && <a href={`mailto:${selected.guest_email}`} className="flex items-center gap-1 hover:text-foreground"><Mail className="size-3"/>{selected.guest_email}</a>}
              <span className="flex items-center gap-1 text-muted-foreground">
                {isGuest ? <Globe className="size-3"/> : <Users className="size-3"/>}
                {isGuest ? "Guest" : "Member"}
              </span>
            </>}
            replyPlaceholder={`ตอบกลับ ${displayName(selected)}...`}
            onSend={handleSend} onClose={()=>setSelected(null)} sending={sending}
          >
            {loadingMsgs ? (
              <div className="flex justify-center py-12"><Loader2 className="size-5 animate-spin text-muted-foreground"/></div>
            ) : msgs.length===0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-muted-foreground gap-2">
                <MessageSquare className="size-10 opacity-20"/>
                <p className="text-sm">ยังไม่มีข้อความ</p>
              </div>
            ) : msgs.map(m => (
              <Bubble key={m.id} content={m.content} senderName={m.sender_name}
                isMe={m.sender_type==="agent"} createdAt={m.created_at}/>
            ))}
            <div ref={bottomRef}/>
          </ThreadPanel>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground flex-col gap-2">
          {isGuest ? <Globe className="size-10 opacity-20"/> : <Users className="size-10 opacity-20"/>}
          <p className="text-sm">เลือกการสนทนาจากรายการ</p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export function B2BConversationTab() {
  const { user } = useAuth();
  const staffName = (user as any)?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Sales";
  const staffId   = user?.id ?? "staff";
  const [chatTab, setChatTab] = useState<ChatTab>("b2b");

  const tabOrder: ChatTab[] = ["b2b", "web", "general"];

  return (
    <div className="flex flex-col" style={{height:"100%",minHeight:0}}>
      {/* Sub-tab bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b bg-background/80 shrink-0 overflow-x-auto">
        {tabOrder.map(t => {
          const cfg = TAB_CONFIG[t];
          const Icon = cfg.icon;
          const isActive = chatTab === t;
          return (
            <button key={t} type="button" onClick={() => setChatTab(t)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? `bg-muted ${cfg.color}`
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}>
              <Icon className="size-3.5"/>
              {cfg.label}
              {isActive && (
                <span className="text-[10px] font-normal opacity-70 hidden sm:inline">· {cfg.desc}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{flex:1,minHeight:0,overflow:"hidden"}}>
        {chatTab === "b2b"     && <B2BTab staffName={staffName} staffId={staffId}/>}
        {chatTab === "web"     && <WebChatTab isGuest={true}  staffName={staffName}/>}
        {chatTab === "general" && <WebChatTab isGuest={false} staffName={staffName}/>}
      </div>
    </div>
  );
}
