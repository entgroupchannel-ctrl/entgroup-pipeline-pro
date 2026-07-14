/**
 * B2BConversationTab — Live Chat viewer เหมือน Admin Panel /admin/live-chat
 * ดึงข้อมูลผ่าน b2b-live-chat edge function (deploy ที่ B2B Supabase project)
 * Authorized by: therdpoom@entgroup.co.th
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2, RefreshCw, MessageSquare, Send, Building2,
  Phone, Mail, Search, CheckCircle2, AlertTriangle,
  Paperclip, Clock, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { formatBaht } from "@/lib/format";
import { crmDb } from "@/lib/crm";
import { STATUS_LABEL, STATUS_COLOR } from "@/lib/b2b-client";

// ─── Config ──────────────────────────────────────────────────────────────────
const LIVE_CHAT_URL = "https://ugzdwmyylqmirrljtuej.supabase.co/functions/v1/b2b-live-chat";
const CRM_SECRET    = "entgroup-crm-secret-2026";

// ─── Types ────────────────────────────────────────────────────────────────────
interface QMsg {
  id: string;
  quote_id: string;
  sender_name: string;
  sender_role: "customer" | "staff";
  content: string;
  message_type: string | null;
  created_at: string;
  read_by: Record<string, string> | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
}

interface QConvo {
  id: string;
  quote_number: string;
  customer_name: string;
  customer_company: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string | null;
  customer_tax_id?: string | null;
  grand_total: number;
  status: string;
  created_at: string;
  sla_po_review_due?: string | null;
  crm_lead_id?: string | null;
  last_message: QMsg | null;
  unread_count: number;
  has_messages: boolean;
  // enriched
  _lead_id?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MONTHS_TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

function fmtDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  if (diffDays < 7) return `${diffDays} วันที่ผ่านมา`;
  return `${d.getDate()} ${MONTHS_TH[d.getMonth()]}`;
}

function fmtFull(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_TH[d.getMonth()]} ${d.getFullYear() + 543} ${d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`;
}

async function lcFetch(path = "", params: Record<string, string> = {}): Promise<any> {
  const url = new URL(LIVE_CHAT_URL + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: { "x-crm-secret": CRM_SECRET } });
  if (!res.ok) throw new Error(`Live chat API error: ${res.status}`);
  return res.json();
}

async function lcPost(body: Record<string, any>): Promise<any> {
  const res = await fetch(LIVE_CHAT_URL, {
    method: "POST",
    headers: { "x-crm-secret": CRM_SECRET, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Live chat POST error: ${res.status}`);
  return res.json();
}

// ─── ChatBubble ───────────────────────────────────────────────────────────────
function Bubble({ msg, isMe }: { msg: QMsg; isMe: boolean }) {
  return (
    <div className={`flex gap-2.5 ${isMe ? "flex-row-reverse" : ""}`}>
      <div className={`size-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold ${
        isMe ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
      }`}>
        {isMe ? "S" : msg.sender_name?.[0]?.toUpperCase() ?? "C"}
      </div>
      <div className={`max-w-[72%] space-y-1 ${isMe ? "items-end" : ""} flex flex-col`}>
        {!isMe && (
          <span className="text-[11px] text-muted-foreground font-medium px-1">{msg.sender_name}</span>
        )}
        <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isMe
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-muted text-foreground rounded-tl-sm"
        }`}>
          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
          {msg.attachment_url && (
            <a href={msg.attachment_url} target="_blank" rel="noreferrer"
              className={`flex items-center gap-1 text-xs mt-1.5 underline ${isMe ? "opacity-80" : "text-primary"}`}>
              <Paperclip className="size-3" />{msg.attachment_name ?? "ไฟล์แนบ"}
            </a>
          )}
        </div>
        <span className={`text-[10px] text-muted-foreground px-1 ${isMe ? "text-right" : ""}`}>
          {fmtFull(msg.created_at)}
        </span>
      </div>
    </div>
  );
}

// ─── Thread panel (right side) ────────────────────────────────────────────────
function ThreadPanel({
  convo,
  staffName,
  staffId,
  onClose,
  onSent,
}: {
  convo: QConvo;
  staffName: string;
  staffId: string;
  onClose: () => void;
  onSent: (quoteId: string) => void;
}) {
  const [messages, setMessages] = useState<QMsg[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [reply,    setReply]    = useState("");
  const [sending,  setSending]  = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await lcFetch("", { quote_id: convo.id });
      setMessages(data ?? []);
    } catch (e: any) {
      toast.error("โหลดข้อความไม่สำเร็จ: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [convo.id]);

  useEffect(() => {
    loadMessages();
    // Mark as read
    lcPost({ mark_read: true, quote_id: convo.id, staff_id: staffId }).catch(() => {});
  }, [convo.id, staffId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await lcPost({
        quote_id:    convo.id,
        sender_name: staffName,
        content:     text,
        message_type: "text",
      });
      setReply("");
      await loadMessages();
      onSent(convo.id);
    } catch (e: any) {
      toast.error("ส่งไม่สำเร็จ: " + e.message);
    } finally {
      setSending(false);
    }
  };

  const slaUrgent = convo.sla_po_review_due &&
    new Date(convo.sla_po_review_due).getTime() - Date.now() < 12 * 3600 * 1000;

  return (
    <div className="flex flex-col h-full border-l border-border bg-background">
      {/* Thread header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b bg-muted/10 shrink-0">
        <div className={`size-10 rounded-full flex items-center justify-center font-semibold text-sm ${
          convo.unread_count > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}>
          {convo.customer_company?.[0]?.toUpperCase() ?? convo.customer_name?.[0] ?? "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate">
              {convo.customer_company || convo.customer_name}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${STATUS_COLOR[convo.status] ?? "bg-muted"}`}>
              {STATUS_LABEL[convo.status] ?? convo.status}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
            <span>{convo.quote_number}</span>
            {convo.customer_name !== convo.customer_company && (
              <span>{convo.customer_name}</span>
            )}
            {convo.grand_total > 0 && (
              <span className="text-primary font-medium">{formatBaht(convo.grand_total)}</span>
            )}
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0 md:hidden">
          <X className="size-5" />
        </button>
      </div>

      {/* Customer info strip */}
      <div className="flex items-center gap-4 px-5 py-2.5 border-b bg-muted/5 text-xs text-muted-foreground flex-wrap shrink-0">
        {convo.customer_phone && (
          <a href={`tel:${convo.customer_phone}`} className="flex items-center gap-1 hover:text-foreground">
            <Phone className="size-3" />{convo.customer_phone}
          </a>
        )}
        {convo.customer_email && (
          <a href={`mailto:${convo.customer_email}`} className="flex items-center gap-1 hover:text-foreground">
            <Mail className="size-3" />{convo.customer_email}
          </a>
        )}
        {convo.customer_address && (
          <span className="flex items-center gap-1">
            <Building2 className="size-3" />{convo.customer_address}
          </span>
        )}
        {convo._lead_id && (
          <a href={`/leads/${convo._lead_id}`} className="flex items-center gap-1 text-primary hover:underline">
            <CheckCircle2 className="size-3" /> Lead ใน CRM
          </a>
        )}
        {slaUrgent && (
          <span className="flex items-center gap-1 text-red-600 font-medium">
            <AlertTriangle className="size-3" /> SLA ด่วน: {fmtDate(convo.sla_po_review_due!)}
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 py-16">
            <MessageSquare className="size-10 opacity-20" />
            <div className="text-center">
              <p className="text-sm font-medium">ยังไม่มีการสนทนา</p>
              <p className="text-xs opacity-60 mt-1">พิมพ์ด้านล่างเพื่อเริ่มบทสนทนากับลูกค้า</p>
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <Bubble key={m.id} msg={m} isMe={m.sender_role === "staff"} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply bar */}
      <div className="flex items-end gap-2.5 px-4 py-3 border-t bg-background shrink-0">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
          placeholder={`ตอบกลับ ${convo.customer_company || convo.customer_name}... (Enter ส่ง)`}
          rows={2}
          className="flex-1 resize-none rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
        />
        <Button
          onClick={handleSend}
          disabled={sending || !reply.trim()}
          size="icon"
          className="size-10 rounded-xl shrink-0"
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </div>
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────
export function B2BConversationTab() {
  const { user } = useAuth();
  const staffName = (user as any)?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Sales";
  const staffId   = user?.id ?? "staff";

  const [convos,   setConvos]   = useState<QConvo[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [search,   setSearch]   = useState("");
  const [selected, setSelected] = useState<QConvo | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data } = await lcFetch("", search ? { search } : {});
      const items: QConvo[] = data ?? [];

      // Enrich with CRM lead_id
      const b2bIds = items.map((r) => r.id).filter(Boolean);
      if (b2bIds.length) {
        const { data: leads } = await crmDb()
          .from("leads")
          .select("id, b2b_request_id")
          .in("b2b_request_id", b2bIds);
        const leadMap: Record<string, string> = {};
        for (const l of (leads ?? []) as any[]) {
          if (l.b2b_request_id) leadMap[l.b2b_request_id] = l.id;
        }
        items.forEach((c) => { c._lead_id = leadMap[c.id] ?? null; });
      }

      setConvos(items);
      // Auto-select first if none
      if (items.length && !selected) setSelected(items[0]);
    } catch (e: any) {
      setError(e.message ?? "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, []);

  // Search with debounce
  useEffect(() => {
    const t = setTimeout(() => load(), 400);
    return () => clearTimeout(t);
  }, [search]);

  // When message sent: refresh unread count
  const handleSent = (quoteId: string) => {
    setConvos((prev) =>
      prev.map((c) => c.id === quoteId ? { ...c, unread_count: 0 } : c)
    );
  };

  const totalUnread = convos.reduce((s, c) => s + c.unread_count, 0);

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left panel: conversation list ── */}
      <div className={`flex flex-col border-r border-border bg-background ${selected ? "hidden md:flex w-[400px] shrink-0" : "flex flex-1"}`}>

        {/* List header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b shrink-0">
          <div className="flex-1">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <MessageSquare className="size-4 text-primary" />
              Live Chat B2B
              {totalUnread > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                  {totalUnread}
                </span>
              )}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">สนทนากับลูกค้า B2B แบบ Real-time</p>
          </div>
          <Button variant="ghost" size="icon" className="size-8" onClick={load} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Search */}
        <div className="px-4 py-2.5 border-b shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาลูกค้า, เลข Quote..."
              className="pl-8 h-8 text-xs"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading && convos.length === 0 ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="p-5">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center dark:border-amber-900/40 dark:bg-amber-950/20">
                <AlertTriangle className="mx-auto mb-2 size-5 text-amber-600" />
                <p className="text-xs font-medium text-amber-800 dark:text-amber-300">{error}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  ต้อง deploy edge function <code className="bg-muted px-1 rounded">b2b-live-chat</code> ก่อน
                </p>
                <Button size="sm" variant="outline" className="mt-3 h-7 text-xs" onClick={load}>
                  <RefreshCw className="mr-1 size-3" /> ลองใหม่
                </Button>
              </div>
            </div>
          ) : convos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <MessageSquare className="size-8 opacity-20 mb-2" />
              <p className="text-sm">{search ? "ไม่พบรายการที่ค้นหา" : "ยังไม่มีการสนทนา"}</p>
            </div>
          ) : (
            convos.map((c) => {
              const isActive = selected?.id === c.id;
              const hasUnread = c.unread_count > 0;
              const preview = c.last_message?.content ?? (c.has_messages ? "" : "ยังไม่มีข้อความ");
              const previewPrefix = c.last_message?.sender_role === "staff" ? "คุณ: " : "";

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelected(c)}
                  className={`w-full text-left flex items-start gap-3 px-5 py-4 border-b border-border/50 transition-colors ${
                    isActive
                      ? "bg-primary/8 border-l-2 border-l-primary"
                      : "hover:bg-muted/30"
                  }`}
                >
                  {/* Avatar */}
                  <div className={`size-10 rounded-full flex items-center justify-center font-semibold text-sm shrink-0 mt-0.5 ${
                    hasUnread ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}>
                    {c.customer_company?.[0]?.toUpperCase() ?? c.customer_name?.[0] ?? "?"}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-sm truncate ${hasUnread ? "font-bold" : "font-medium"}`}>
                        {c.customer_company || c.customer_name}
                      </span>
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {c.last_message ? fmtDate(c.last_message.created_at) : fmtDate(c.created_at)}
                      </span>
                    </div>

                    {c.customer_company && c.customer_name !== c.customer_company && (
                      <p className="text-xs text-muted-foreground truncate">{c.customer_name}</p>
                    )}

                    <p className={`text-xs truncate ${hasUnread ? "text-foreground" : "text-muted-foreground"}`}>
                      {previewPrefix}{preview}
                    </p>

                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[10px] text-muted-foreground font-mono">{c.quote_number}</span>
                      {c.grand_total > 0 && (
                        <span className="text-[10px] text-muted-foreground">{formatBaht(c.grand_total)}</span>
                      )}
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${STATUS_COLOR[c.status] ?? "bg-muted text-muted-foreground"}`}>
                        {STATUS_LABEL[c.status] ?? c.status}
                      </span>
                      {c._lead_id && (
                        <span title="มี Lead แล้ว" className="inline-flex">
                          <CheckCircle2 className="size-3 text-emerald-500" />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Unread badge */}
                  {hasUnread && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white shrink-0 mt-2">
                      {c.unread_count}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right panel: thread ── */}
      {selected ? (
        <div className="flex-1 min-w-0">
          <ThreadPanel
            convo={selected}
            staffName={staffName}
            staffId={staffId}
            onClose={() => setSelected(null)}
            onSent={handleSent}
          />
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground flex-col gap-3">
          <MessageSquare className="size-12 opacity-20" />
          <div className="text-center">
            <p className="font-medium">เลือกการสนทนาจากรายการด้านซ้าย</p>
            <p className="text-sm opacity-60 mt-1">หรือรอข้อความใหม่จากลูกค้า</p>
          </div>
        </div>
      )}
    </div>
  );
}
