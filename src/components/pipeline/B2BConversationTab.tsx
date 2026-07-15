/**
 * B2BConversationTab v3 — LINE Official style
 * 2-column layout: conversation list (left) | thread + compose (right)
 * Fills 100% viewport height — no page scroll needed
 * Authorized by: therdpoom@entgroup.co.th
 */
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  Loader2, RefreshCw, MessageSquare, Send, Phone, Mail,
  Search, CheckCircle2, AlertTriangle, ShoppingCart, Globe,
  Users, X, Paperclip, FileText as FileIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { formatBaht } from "@/lib/format";
import { crmDb } from "@/lib/crm";
import { STATUS_LABEL, STATUS_COLOR, fetchUnmatchedQuotes } from "@/lib/b2b-client";

// ─── Config ───────────────────────────────────────────────────────────────────
const LC = "https://ugzdwmyylqmirrljtuej.supabase.co/functions/v1/b2b-live-chat";
const SK = "entgroup-crm-secret-2026";

type ChatTab = "b2b" | "web" | "general";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Convo {
  id: string;
  name: string;
  subName?: string;
  lastMsg?: string;
  lastMsgIsMe?: boolean;
  lastAt: string;
  unread: number;
  status: string;
  badge?: string;
  value?: number;
  leadId?: string | null;
  raw: any;
}

interface Msg {
  id: string;
  content: string;
  senderName: string;
  isMe: boolean;
  createdAt: string;
  attachUrl?: string | null;
  attachName?: string | null;
}

// ─── Utils ────────────────────────────────────────────────────────────────────
const MO = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
function ts(iso: string) {
  const d = new Date(iso), n = new Date();
  const diff = Math.floor((n.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  if (diff < 7)  return `${diff}ว.`;
  if (diff < 365) return `${d.getDate()} ${MO[d.getMonth()]}`;
  return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()+543}`;
}
function tf(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MO[d.getMonth()]} ${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;
}
function isImg(n?: string | null) { return /\.(jpg|jpeg|png|gif|webp)$/i.test(n ?? ""); }

async function lcGet(p: Record<string,string>) {
  const u = new URL(LC);
  Object.entries(p).forEach(([k,v]) => u.searchParams.set(k,v));
  const r = await fetch(u.toString(), { headers: { "x-crm-secret": SK } });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}
async function lcPost(b: Record<string,any>) {
  const r = await fetch(LC, {
    method: "POST",
    headers: { "x-crm-secret": SK, "content-type": "application/json" },
    body: JSON.stringify(b),
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

// ─── Bubble ───────────────────────────────────────────────────────────────────
function Bubble({ msg }: { msg: Msg }) {
  return (
    <div className={`flex gap-2 ${msg.isMe ? "flex-row-reverse" : ""}`}>
      <div className={`size-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold mt-1 ${
        msg.isMe ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
      }`}>
        {msg.isMe ? "S" : msg.senderName?.[0]?.toUpperCase() ?? "?"}
      </div>
      <div className={`max-w-[68%] flex flex-col gap-1 ${msg.isMe ? "items-end" : "items-start"}`}>
        {!msg.isMe && <span className="text-[10px] text-muted-foreground px-0.5">{msg.senderName}</span>}
        {msg.attachUrl && (
          isImg(msg.attachName)
            ? <img src={msg.attachUrl} alt={msg.attachName ?? ""} onClick={() => window.open(msg.attachUrl!, "_blank")}
                className="max-w-[200px] rounded-xl border cursor-pointer hover:opacity-90" />
            : <a href={msg.attachUrl} target="_blank" rel="noreferrer"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs border ${
                  msg.isMe ? "bg-primary/80 text-primary-foreground border-primary/50" : "bg-muted border-border"}`}>
                <Paperclip className="size-3 shrink-0" />{msg.attachName ?? "ไฟล์แนบ"}
              </a>
        )}
        {msg.content && (
          <div className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
            msg.isMe
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-[#f0f0f0] dark:bg-muted text-foreground rounded-tl-sm"
          }`}>
            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
          </div>
        )}
        <span className="text-[10px] text-muted-foreground/70 px-0.5">{tf(msg.createdAt)}</span>
      </div>
    </div>
  );
}

// ─── ConvoRow ─────────────────────────────────────────────────────────────────
function ConvoRow({ c, isActive, accent, onClick }: {
  c: Convo; isActive: boolean; accent: string; onClick: () => void;
}) {
  const hasNew = c.unread > 0;
  const dotClr = { blue: "bg-blue-500", teal: "bg-teal-500", purple: "bg-purple-500" }[accent] ?? "bg-primary";
  return (
    <button type="button" onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b border-border/30 transition-colors ${
        isActive ? "bg-primary/8 border-l-[3px] border-l-primary" : "hover:bg-muted/40"
      }`}>
      {/* avatar */}
      <div className={`size-10 rounded-full flex-shrink-0 flex items-center justify-center font-semibold text-sm ${
        hasNew ? `${dotClr} text-white` : "bg-muted text-muted-foreground"
      }`}>
        {c.name?.[0]?.toUpperCase() ?? "?"}
      </div>

      {/* content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-1">
          <span className={`text-sm truncate ${hasNew ? "font-bold" : "font-medium"}`}>{c.name}</span>
          <span className="text-[11px] text-muted-foreground shrink-0 ml-1">{ts(c.lastAt)}</span>
        </div>
        <p className={`text-xs truncate ${hasNew ? "text-foreground font-medium" : "text-muted-foreground"}`}>
          {c.lastMsgIsMe ? "คุณ: " : ""}{c.lastMsg ?? c.badge ?? "ยังไม่มีข้อความ"}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {c.badge && <span className="font-mono text-[10px] text-muted-foreground">{c.badge}</span>}
          {c.value != null && c.value > 0 && <span className="text-[10px] text-muted-foreground">· {formatBaht(c.value)}</span>}
          {c.status && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLOR[c.status] ?? "bg-muted/60 text-muted-foreground"}`}>
              {STATUS_LABEL[c.status] ?? c.status}
            </span>
          )}
          {c.leadId && <CheckCircle2 className="size-3 text-emerald-500" />}
        </div>
      </div>

      {/* unread */}
      {hasNew && (
        <span className="size-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
          {c.unread > 9 ? "9+" : c.unread}
        </span>
      )}
    </button>
  );
}

// ─── ThreadPane (right side — full height) ────────────────────────────────────
function ThreadPane({ convo, msgs, loading, draft, setDraft, onSend, sending, onBack, tab }: {
  convo: Convo; msgs: Msg[]; loading: boolean;
  draft: string; setDraft: (v: string) => void;
  onSend: (text: string, file?: File) => Promise<void>;
  sending: boolean; onBack: () => void; tab: ChatTab;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef   = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  useEffect(() => {
    if (file?.type.startsWith("image/")) {
      const u = URL.createObjectURL(file);
      setPreviewUrl(u);
      return () => URL.revokeObjectURL(u);
    } else {
      setPreviewUrl(null);
    }
  }, [file]);

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast.error("ไฟล์ใหญ่เกิน 10 MB"); return; }
    setFile(f);
    e.target.value = "";
  };

  const handleSend = async () => {
    if ((!draft.trim() && !file) || sending) return;
    await onSend(draft.trim(), file ?? undefined);
    setDraft(""); setFile(null); setPreviewUrl(null);
  };

  const r = convo.raw;

  return (
    <div className="flex flex-col" style={{ flex: 1, minWidth: 0, height: "100%", overflow: "hidden", background: "var(--background)" }}>

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-background shrink-0 shadow-sm">
        <button type="button" onClick={onBack} className="md:hidden text-muted-foreground hover:text-foreground mr-1">
          <X className="size-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-tight truncate">{convo.name}</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
            {r?.customer_phone && <a href={`tel:${r.customer_phone}`} className="flex items-center gap-1 hover:text-foreground transition-colors"><Phone className="size-3"/>{r.customer_phone}</a>}
            {r?.customer_email && <a href={`mailto:${r.customer_email}`} className="flex items-center gap-1 hover:text-foreground transition-colors"><Mail className="size-3"/>{r.customer_email}</a>}
            {r?.guest_phone    && <a href={`tel:${r.guest_phone}`}     className="flex items-center gap-1 hover:text-foreground transition-colors"><Phone className="size-3"/>{r.guest_phone}</a>}
            {r?.guest_email    && <a href={`mailto:${r.guest_email}`}   className="flex items-center gap-1 hover:text-foreground transition-colors"><Mail className="size-3"/>{r.guest_email}</a>}
            {convo.badge && <span className="font-mono opacity-60">{convo.badge}</span>}
            {convo.value != null && convo.value > 0 && <span className="font-medium text-primary">{formatBaht(convo.value)}</span>}
            {convo.leadId && <a href={`/leads/${convo.leadId}`} className="flex items-center gap-1 text-emerald-600 hover:underline"><CheckCircle2 className="size-3"/>Lead</a>}
          </div>
        </div>
      </div>

      {/* ── Messages area ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4"
        style={{ background: "#f7f7f7" }}
        // dark mode handled via CSS variable fallback
      >
        {loading ? (
          <div className="flex justify-center pt-12"><Loader2 className="size-5 animate-spin text-muted-foreground"/></div>
        ) : msgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground py-12">
            <MessageSquare className="size-10 opacity-20"/>
            <p className="text-sm font-medium">ยังไม่มีข้อความ</p>
            <p className="text-xs opacity-60">พิมพ์ด้านล่างเพื่อเริ่มบทสนทนา</p>
          </div>
        ) : msgs.map(m => <Bubble key={m.id} msg={m}/>)}
        <div ref={bottomRef}/>
      </div>

      {/* ── Compose bar ── */}
      <div className="shrink-0 border-t border-border bg-background">
        {/* file preview strip */}
        {file && (
          <div className="flex items-center gap-2 px-4 pt-2 pb-1">
            {previewUrl
              ? <img src={previewUrl} alt={file.name} className="size-12 rounded-lg object-cover border"/>
              : <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 text-xs">
                  <FileIcon className="size-4 text-muted-foreground"/>{file.name}
                </div>
            }
            <button type="button" onClick={() => { setFile(null); setPreviewUrl(null); }}
              className="size-5 rounded-full bg-destructive text-white flex items-center justify-center text-xs font-bold hover:opacity-80">
              ×
            </button>
          </div>
        )}

        <div className="flex items-end gap-2 px-3 py-2.5">
          {/* attach */}
          <input ref={fileRef} type="file" className="hidden"
            accept="image/*,.pdf,.xlsx,.xls,.docx,.doc,.txt,.csv" onChange={handleFile}/>
          <button type="button" onClick={() => fileRef.current?.click()}
            title="แนบไฟล์"
            className="shrink-0 size-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <Paperclip className="size-4"/>
          </button>

          {/* text input */}
          <textarea value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
            placeholder={`ส่งข้อความถึง ${convo.name}...`}
            rows={1}
            style={{ maxHeight: 120, resize: "none", overflow: "auto" }}
            className="flex-1 rounded-2xl border border-border bg-muted/40 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
          />

          {/* send */}
          <button type="button" onClick={handleSend}
            disabled={sending || (!draft.trim() && !file)}
            className={`shrink-0 size-9 rounded-full flex items-center justify-center transition-all ${
              !sending && (draft.trim() || file)
                ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            }`}>
            {sending ? <Loader2 className="size-4 animate-spin"/> : <Send className="size-4"/>}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground text-center pb-1.5 opacity-50">
          Enter ส่ง · Shift+Enter ขึ้นบรรทัด · รองรับไฟล์ภาพ/PDF/Excel
        </p>
      </div>
    </div>
  );
}

// ─── B2B Tab ──────────────────────────────────────────────────────────────────
function B2BTab({ sName, sId, draft, setDraft }: {
  sName: string; sId: string; draft: string; setDraft: (v: string) => void;
}) {
  const [convos,   setConvos]   = useState<Convo[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string|null>(null);
  const [search,   setSearch]   = useState("");
  const [sel,      setSel]      = useState<Convo|null>(null);
  const [msgs,     setMsgs]     = useState<Msg[]>([]);
  const [msgLoad,  setMsgLoad]  = useState(false);
  const [sending,  setSending]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const raw = await fetchUnmatchedQuotes(100);
      const q   = search.toLowerCase();
      const fil = q ? raw.filter(r =>
        r.quote_number.toLowerCase().includes(q) ||
        r.customer_company.toLowerCase().includes(q) ||
        r.customer_name.toLowerCase().includes(q)) : raw;
      const ids = fil.map(r => r.id);
      const lm: Record<string,string> = {};
      if (ids.length) {
        const { data: leads } = await crmDb().from("leads").select("id,b2b_request_id").in("b2b_request_id", ids);
        for (const l of (leads??[]) as any[]) if (l.b2b_request_id) lm[l.b2b_request_id] = l.id;
      }
      const items: Convo[] = fil.map(r => ({
        id: r.id, name: r.customer_company || r.customer_name,
        subName: r.customer_company ? r.customer_name : undefined,
        lastAt: r.created_at, unread: 0, status: r.status,
        badge: r.quote_number, value: r.grand_total,
        leadId: lm[r.id] ?? null, raw: r,
      }));
      setConvos(items);
      if (!sel && items.length) setSel(items[0]);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [search]);

  const loadMsgs = useCallback(async (id: string) => {
    setMsgLoad(true);
    try {
      const { data } = await lcGet({ action: "b2b", quote_id: id });
      setMsgs((data??[]).map((m:any) => ({
        id: m.id, content: m.content, senderName: m.sender_name,
        isMe: m.sender_role === "staff", createdAt: m.created_at,
        attachUrl: m.attachment_url, attachName: m.attachment_name,
      })));
      lcPost({ action:"b2b", mark_read:true, quote_id:id, staff_id:sId }).catch(()=>{});
    } catch { toast.error("โหลดข้อความไม่สำเร็จ"); }
    finally { setMsgLoad(false); }
  }, [sId]);

  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setTimeout(()=>load(),400); return ()=>clearTimeout(t); }, [search]);
  useEffect(() => { if (sel) loadMsgs(sel.id); }, [sel?.id]);

  const handleSend = async (text: string, file?: File) => {
    if (!sel) return;
    setSending(true);
    try {
      let attachUrl: string | null = null;
      let attachName: string | null = null;
      if (file) {
        // Upload to pipeline-pro Supabase Storage (documents bucket, public)
        const { supabase: sb } = await import("@/integrations/supabase/client");
        const ext  = file.name.split(".").pop() ?? "bin";
        const path = `chat/${sel.id}/${Date.now()}.${ext}`;
        const { data: up, error: upErr } = await (sb as any).storage
          .from("documents").upload(path, file, { upsert: true, contentType: file.type });
        if (upErr) { toast.error("อัปโหลดไฟล์ไม่สำเร็จ: " + upErr.message); setSending(false); return; }
        const { data: { publicUrl } } = (sb as any).storage.from("documents").getPublicUrl(path);
        attachUrl  = publicUrl;
        attachName = file.name;
      }
      await lcPost({
        action:"b2b", quote_id:sel.id, sender_name:sName,
        content: text || (file ? file.name : " "),
        ...(attachUrl ? { attachment_url: attachUrl, attachment_name: attachName } : {}),
      });
      await loadMsgs(sel.id);
    } catch (e:any) { toast.error("ส่งไม่สำเร็จ: "+e.message); }
    finally { setSending(false); }
  };

  return (
    <div style={{ display:"flex", height:"100%", overflow:"hidden" }}>
      {/* Left list */}
      <div style={{ width:340, minWidth:280, display:"flex", flexDirection:"column", height:"100%", overflow:"hidden", borderRight:"1px solid var(--border)" }}>
        {/* search */}
        <div className="px-3 py-2 border-b bg-background shrink-0">
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
            <Search className="size-3.5 text-muted-foreground shrink-0"/>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="ค้นหา..." className="flex-1 bg-transparent text-xs focus:outline-none"/>
            <span className="text-[10px] text-muted-foreground shrink-0">{convos.length} รายการ</span>
          </div>
        </div>
        {/* list */}
        <div className="flex-1 overflow-y-auto">
          {loading && !convos.length ? (
            <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground"/></div>
          ) : error ? (
            <div className="p-4 text-center">
              <AlertTriangle className="size-5 text-amber-500 mx-auto mb-2"/>
              <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">{error}</p>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={load}><RefreshCw className="size-3 mr-1"/>ลองใหม่</Button>
            </div>
          ) : convos.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
              <ShoppingCart className="size-8 opacity-20"/>
              <p className="text-xs">{search ? "ไม่พบ" : "ยังไม่มีข้อมูล"}</p>
            </div>
          ) : convos.map(c => (
            <ConvoRow key={c.id} c={c} isActive={sel?.id===c.id} accent="blue"
              onClick={() => setSel(c)}/>
          ))}
        </div>
      </div>

      {/* Right thread */}
      {sel ? (
        <ThreadPane convo={sel} msgs={msgs} loading={msgLoad}
          draft={draft} setDraft={setDraft} onSend={handleSend}
          sending={sending} onBack={()=>setSel(null)} tab="b2b"/>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-3" style={{background:"#f7f7f7"}}>
          <MessageSquare className="size-12 opacity-20"/>
          <p className="text-sm">เลือกการสนทนาจากรายการด้านซ้าย</p>
          <p className="text-xs opacity-60">หรือรอข้อความใหม่จากลูกค้า</p>
        </div>
      )}
    </div>
  );
}

// ─── Web/General Tab ──────────────────────────────────────────────────────────
function WebTab({ isGuest, sName, sId, draft, setDraft }: {
  isGuest: boolean; sName: string; sId: string; draft: string; setDraft: (v: string) => void;
}) {
  const act = isGuest ? "web" : "general";
  const [convos,   setConvos]   = useState<Convo[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string|null>(null);
  const [search,   setSearch]   = useState("");
  const [sel,      setSel]      = useState<Convo|null>(null);
  const [msgs,     setMsgs]     = useState<Msg[]>([]);
  const [msgLoad,  setMsgLoad]  = useState(false);
  const [sending,  setSending]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const p: Record<string,string> = { action: act };
      if (search) p.search = search;
      const { data } = await lcGet(p);
      const items: Convo[] = (data??[]).map((s:any) => ({
        id: s.id,
        name: s.guest_name ?? s.guest_email ?? (s.user_id ? "สมาชิก" : "ผู้เยี่ยมชม"),
        subName: s.guest_email ?? undefined,
        lastMsg: s.last_message?.content,
        lastMsgIsMe: s.last_message?.sender_type === "staff",
        lastAt: s.last_message_at ?? s.created_at,
        unread: s.unread_count ?? 0,
        status: s.status,
        raw: s,
      }));
      setConvos(items);
      if (!sel && items.length) setSel(items[0]);
    } catch (e:any) { setError(e.message); }
    finally { setLoading(false); }
  }, [act, search]);

  const loadMsgs = useCallback(async (id: string) => {
    setMsgLoad(true);
    try {
      const { data } = await lcGet({ action:act, session_id:id });
      setMsgs((data??[]).map((m:any) => ({
        id: m.id, content: m.content, senderName: m.sender_name,
        isMe: m.sender_type === "staff", createdAt: m.created_at,
        attachUrl: m.attachment_url, attachName: m.attachment_name,
      })));
      lcPost({ action:`${act}_read`, session_id:id }).catch(()=>{});
      setConvos(prev => prev.map(c => c.id===id ? {...c, unread:0} : c));
    } catch { toast.error("โหลดข้อความไม่สำเร็จ"); }
    finally { setMsgLoad(false); }
  }, [act]);

  useEffect(() => { load(); }, [isGuest]);
  useEffect(() => { const t = setTimeout(()=>load(),400); return ()=>clearTimeout(t); }, [search]);
  useEffect(() => { if (sel) loadMsgs(sel.id); }, [sel?.id]);

  const handleSend = async (text: string, file?: File) => {
    if (!sel) return;
    setSending(true);
    try {
      let attachUrl: string | null = null;
      let attachName: string | null = null;
      if (file) {
        const { supabase: sb } = await import("@/integrations/supabase/client");
        const ext  = file.name.split(".").pop() ?? "bin";
        const path = `chat/${sel.id}/${Date.now()}.${ext}`;
        const { data: up, error: upErr } = await (sb as any).storage
          .from("documents").upload(path, file, { upsert: true, contentType: file.type });
        if (upErr) { toast.error("อัปโหลดไฟล์ไม่สำเร็จ: " + upErr.message); setSending(false); return; }
        const { data: { publicUrl } } = (sb as any).storage.from("documents").getPublicUrl(path);
        attachUrl  = publicUrl;
        attachName = file.name;
      }
      await lcPost({
        action:`${act}_send`, session_id:sel.id, sender_name:sName,
        content: text || (file ? file.name : " "),
        ...(attachUrl ? { attachment_url: attachUrl, attachment_name: attachName } : {}),
      });
      await loadMsgs(sel.id);
    } catch (e:any) { toast.error("ส่งไม่สำเร็จ: "+e.message); }
    finally { setSending(false); }
  };

  const Icon = isGuest ? Globe : Users;
  const accent = isGuest ? "teal" : "purple";

  return (
    <div style={{ display:"flex", height:"100%", overflow:"hidden" }}>
      {/* Left */}
      <div style={{ width:340, minWidth:280, display:"flex", flexDirection:"column", height:"100%", overflow:"hidden", borderRight:"1px solid var(--border)" }}>
        <div className="px-3 py-2 border-b bg-background shrink-0">
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
            <Search className="size-3.5 text-muted-foreground shrink-0"/>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="ค้นหา..." className="flex-1 bg-transparent text-xs focus:outline-none"/>
            <span className="text-[10px] text-muted-foreground shrink-0">{convos.length} รายการ</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && !convos.length ? (
            <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground"/></div>
          ) : error ? (
            <div className="p-4 text-center">
              <AlertTriangle className="size-5 text-amber-500 mx-auto mb-2"/>
              <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">{error}</p>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={load}><RefreshCw className="size-3 mr-1"/>ลองใหม่</Button>
            </div>
          ) : convos.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
              <Icon className="size-8 opacity-20"/><p className="text-xs">{search ? "ไม่พบ" : "ยังไม่มีข้อมูล"}</p>
            </div>
          ) : convos.map(c => (
            <ConvoRow key={c.id} c={c} isActive={sel?.id===c.id} accent={accent} onClick={()=>setSel(c)}/>
          ))}
        </div>
      </div>

      {/* Right */}
      {sel ? (
        <ThreadPane convo={sel} msgs={msgs} loading={msgLoad}
          draft={draft} setDraft={setDraft} onSend={handleSend}
          sending={sending} onBack={()=>setSel(null)} tab={act as ChatTab}/>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-3" style={{background:"#f7f7f7"}}>
          <Icon className="size-12 opacity-20"/>
          <p className="text-sm">เลือกการสนทนาจากรายการด้านซ้าย</p>
        </div>
      )}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export function B2BConversationTab({
  unreadCounts = { b2b: 0, web: 0, general: 0 },
}: {
  unreadCounts?: Record<ChatTab, number>;
}) {
  const { user } = useAuth();
  const sName = (user as any)?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Sales";
  const sId   = user?.id ?? "staff";
  const [tab, setTab]   = useState<ChatTab>("b2b");
  const [drafts, setDrafts] = useState<Record<ChatTab,string>>({ b2b:"", web:"", general:"" });
  const setDraft = (t: ChatTab) => (v: string) => setDrafts(p => ({ ...p, [t]: v }));

  const TABS: { key: ChatTab; label: string; Icon: typeof MessageSquare }[] = [
    { key:"b2b",     label:"ใบเสนอราคา B2B", Icon:ShoppingCart },
    { key:"web",     label:"Chat หน้าเว็บ",   Icon:Globe },
    { key:"general", label:"General Chat",   Icon:Users },
  ];

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", minHeight:0, overflow:"hidden" }}>
      {/* sub-tab strip */}
      <div className="flex items-center gap-1 px-4 py-1.5 border-b bg-muted/20 shrink-0">
        {TABS.map(({ key, label, Icon }) => {
          const active  = tab === key;
          const uCount  = unreadCounts[key] ?? 0;
          const colors: Record<ChatTab,string> = {
            b2b:     "text-blue-600 bg-blue-50 dark:bg-blue-950/40",
            web:     "text-teal-600 bg-teal-50 dark:bg-teal-950/40",
            general: "text-purple-600 bg-purple-50 dark:bg-purple-950/40",
          };
          return (
            <button key={key} type="button" onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                active ? colors[key] : "text-muted-foreground hover:bg-muted/60"
              }`}>
              <Icon className="size-3.5"/>
              {label}
              {/* unread badge — แสดงทุก tab ไม่ว่า active หรือไม่ */}
              {uCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                  {uCount > 99 ? "99+" : uCount}
                </span>
              )}
              {/* draft dot */}
              {!active && drafts[key] && uCount === 0 && (
                <span className="size-1.5 rounded-full bg-amber-400"/>
              )}
            </button>
          );
        })}
      </div>

      {/* content — fills remaining height */}
      <div style={{ flex:1, minHeight:0, overflow:"hidden" }}>
        {tab==="b2b"     && <B2BTab sName={sName} sId={sId} draft={drafts.b2b}     setDraft={setDraft("b2b")}/>}
        {tab==="web"     && <WebTab isGuest={true}  sName={sName} sId={sId} draft={drafts.web}     setDraft={setDraft("web")}/>}
        {tab==="general" && <WebTab isGuest={false} sName={sName} sId={sId} draft={drafts.general} setDraft={setDraft("general")}/>}
      </div>
    </div>
  );
}
